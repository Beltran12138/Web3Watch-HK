"""SFC 公共登记册每日快照 + 与上一份比对，产出变动信号（GitHub Actions 每晚跑，见 .github/workflows/intel_sfc.yml）。

  python intel/sfc_snapshot.py run       抓今天的全量（名单 + 每家的牌照条件与负责人员），与 current 比对后替换 current
  python intel/sfc_snapshot.py firms     只根据 current 重新生成 firms.json（机构摘要 + VA 标签 + 内地母品牌）

数据目录（环境变量 INTEL_DATA，默认 ./data，Actions 里是 intel-data 分支的检出）：
  sfc/current/corps.json      名单（每家持有的牌照）
  sfc/current/enrich.jsonl    每家的牌照条件 + 负责人员（RO / 银行为 EO）
  sfc/current/META.json       {"date": 快照日期}
  sfc/firms.json              给下游用的机构摘要
  sfc/diffs/<日期>.json|.md   与上一份的比对
  sfc/signals.jsonl           所有变动信号的累计流水

规则：任一边条件页没抓到的机构，不比对条件和人员（避免把抓取失败当成「撤销 / 离职」）；
条件页不完整时不替换 current、不写比对，直接失败退出。
"""
import datetime, hashlib, http.cookiejar, json, os, re, shutil, sys, threading, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import brands  # noqa: E402

DATA = os.path.abspath(os.environ.get("INTEL_DATA", "data"))
SFC = os.path.join(DATA, "sfc")
CUR = os.path.join(SFC, "current")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
LETTERS = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
TYPES = [("ratype", str(t)) for t in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13]] + [("ratypeamlo", "101")]
VA_P = [("VA资管", r"virtual asset related asset management"), ("VA交易", r"virtual asset dealing"),
        ("VA咨询", r"virtual asset advisory"), ("VA引荐", r"introducing clients to virtual asset trading platform")]
HKT = datetime.timezone(datetime.timedelta(hours=8))


def log(msg):
    print(f"{datetime.datetime.now(HKT):%Y-%m-%d %H:%M:%S} {msg}", flush=True)


# ---------- 抓取 ----------
def session():
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    op.open(urllib.request.Request("https://apps.sfc.hk/publicregWeb/searchByRa?locale=en", headers={"User-Agent": UA}), timeout=60).read()
    return cj


def opener(cj):
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def pull_list(cj):
    H = {"User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "Referer": "https://apps.sfc.hk/publicregWeb/searchByRa?locale=en"}
    corp, ras = {}, {}
    for k, v in TYPES:
        n = 0
        for letter in LETTERS:
            start = 0
            while True:
                body = urllib.parse.urlencode({"licstatus": "active", k: v, "roleType": "corporation", "nameStartLetter": letter,
                                               "page": start // 500 + 1, "start": start, "limit": 500}).encode()
                for t in range(4):
                    try:
                        d = json.loads(opener(cj).open(urllib.request.Request("https://apps.sfc.hk/publicregWeb/searchByRaJson", data=body, headers=H), timeout=90).read())
                        break
                    except Exception as e:
                        if t == 3:
                            raise RuntimeError(f"名单抓取失败 {k}={v} {letter}: {e}")
                        time.sleep(5 * (t + 1))
                for it in d["items"]:
                    corp[it["ceref"]] = it
                    ras.setdefault(it["ceref"], set()).add("VATP" if k == "ratypeamlo" else "T" + v)
                n += len(d["items"])
                start += len(d["items"])
                if not d["items"] or start >= d["totalCount"]:
                    break
            time.sleep(0.3)
        log(f"名单 {k}={v}: {n}")
    for ce, it in corp.items():
        it["ras"] = sorted(ras[ce])
    return list(corp.values())


def var(t, name):
    m = re.search(r"var " + name + r"\s*=\s*(\[.*?\]);", t or "", re.S)
    try:
        return json.loads(m.group(1)) if m else None
    except Exception:
        return None


def enrich_all(cj, corps, out, workers=4):
    done = set()
    if os.path.exists(out):
        done = {json.loads(l)["ceref"] for l in open(out, encoding="utf-8") if json.loads(l)["ok"]}
    todo = [s for s in corps if s["ceref"] not in done]
    log(f"条件页待抓 {len(todo)}，已有 {len(done)}")
    lock = threading.Lock()

    def fetch(url):
        for t in range(4):
            try:
                return opener(cj).open(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60).read().decode("utf-8", "ignore")
            except Exception:
                time.sleep(4 * (t + 1))
        return None

    def work(s):
        ri = bool(s.get("isRi"))  # 银行是注册机构，详情页走 /ri/，人员是 EO
        base = f"https://apps.sfc.hk/publicregWeb/{'ri' if ri else 'corp'}/{s['ceref']}/"
        cond = var(fetch(base + "conditions"), "condData")
        ppl = var(fetch(base + ("eo" if ri else "ro")), "eoData" if ri else "rorawData")
        rec = {"ceref": s["ceref"], "ri": ri, "ok": cond is not None and ppl is not None,
               "conditions": [{"eff": x.get("effDate"), "en": x.get("conditionDtl")} for x in (cond or [])],
               "ro": [{"ce": x.get("ceRef"), "name": x.get("fullName"), "zh": x.get("entityNameChi")} for x in (ppl or [])]}
        with lock:
            with open(out, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        time.sleep(0.3)

    n = 0
    with ThreadPoolExecutor(workers) as ex:
        for _ in ex.map(work, todo):
            n += 1
            if n % 500 == 0:
                log(f"条件页 {n}/{len(todo)}")


# ---------- 读快照 ----------
def load(d):
    corps = {s["ceref"]: s for s in json.load(open(os.path.join(d, "corps.json"), encoding="utf-8"))}
    enrich = {}
    for line in open(os.path.join(d, "enrich.jsonl"), encoding="utf-8"):
        r = json.loads(line)
        enrich[r["ceref"]] = r  # 续跑可能有重复行，以最后一次为准
    return corps, enrich


def va_flags(rec):
    texts = [c.get("en") or "" for c in rec.get("conditions", [])]
    return {n for n, p in VA_P if any(re.search(p, t, re.I) for t in texts)}


def cond_hash(rec):
    return hashlib.sha1("\n".join(sorted((c.get("en") or "").strip() for c in rec.get("conditions", []))).encode()).hexdigest()[:12]


# ---------- 比对 ----------
def diff(old, new, old_day, new_day):
    oc, oe = old
    nc, ne = new
    sig, skipped = [], []

    def add(ce, kind, detail):
        s = nc.get(ce) or oc.get(ce)
        zh = s.get("nameChi") if s.get("nameChi") not in (None, "\x00") else ""
        sig.append({"date": new_day, "since": old_day, "ce": ce, "en": (s.get("name") or "").strip(), "zh": zh, "type": kind, "detail": detail})

    for ce in sorted(set(nc) - set(oc)):
        add(ce, "新持牌机构", "牌照：" + " ".join(nc[ce]["ras"]))
        if va_flags(ne.get(ce, {})):
            add(ce, "VA资格新增", "、".join(sorted(va_flags(ne[ce]))))
    for ce in sorted(set(oc) - set(nc)):
        add(ce, "退出名单", "原牌照：" + " ".join(oc[ce]["ras"]))
    for ce in sorted(set(oc) & set(nc)):
        o_ras, n_ras = set(oc[ce]["ras"]), set(nc[ce]["ras"])
        if n_ras - o_ras:
            add(ce, "新增牌照", " ".join(sorted(n_ras - o_ras)))
        if o_ras - n_ras:
            add(ce, "牌照减少", " ".join(sorted(o_ras - n_ras)))
        o, n = oe.get(ce), ne.get(ce)
        if not (o and n and o.get("ok") and n.get("ok")):
            skipped.append(ce)
            continue
        ov, nv = va_flags(o), va_flags(n)
        if nv - ov:
            add(ce, "VA资格新增", "、".join(sorted(nv - ov)))
        if ov - nv:
            add(ce, "VA资格减少", "、".join(sorted(ov - nv)))
        if cond_hash(o) != cond_hash(n) and not (nv ^ ov):
            add(ce, "牌照条件变更", f"条件 {len(o['conditions'])} → {len(n['conditions'])} 条")
        oro = {p["ce"]: p["name"] for p in o["ro"] if p.get("ce")}
        nro = {p["ce"]: p["name"] for p in n["ro"] if p.get("ce")}
        if set(nro) - set(oro):
            add(ce, "负责人员加入", "、".join(nro[c] for c in sorted(set(nro) - set(oro))))
        if set(oro) - set(nro):
            add(ce, "负责人员离开", "、".join(oro[c] for c in sorted(set(oro) - set(nro))))
    return sig, skipped


def write_diff(old_day, new_day, sig, skipped):
    d = os.path.join(SFC, "diffs")
    os.makedirs(d, exist_ok=True)
    json.dump({"since": old_day, "date": new_day, "skipped": skipped, "signals": sig},
              open(os.path.join(d, f"{new_day}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    order = ["VA资格新增", "新持牌机构", "新增牌照", "负责人员加入", "负责人员离开", "VA资格减少", "牌照减少", "退出名单", "牌照条件变更"]
    lines = [f"# SFC 变化 {old_day} → {new_day}", "", f"共 {len(sig)} 条信号；{len(skipped)} 家因抓取失败未比对条件与人员。", ""]
    for kind in order:
        items = [s for s in sig if s["type"] == kind]
        if items:
            lines += [f"## {kind}（{len(items)}）", ""] + [f"- {s['zh'] or s['en']}（{s['ce']}）：{s['detail']}" for s in items] + [""]
    open(os.path.join(d, f"{new_day}.md"), "w", encoding="utf-8").write("\n".join(lines))
    path = os.path.join(SFC, "signals.jsonl")
    keep = [l for l in open(path, encoding="utf-8") if json.loads(l)["date"] != new_day] if os.path.exists(path) else []
    with open(path, "w", encoding="utf-8") as f:  # 同一天重跑时替换当天的旧信号
        f.writelines(keep + [json.dumps(s, ensure_ascii=False) + "\n" for s in sig])


# ---------- 机构摘要 ----------
def write_firms():
    corps, enrich = load(CUR)
    out = []
    for ce, s in sorted(corps.items()):
        r = enrich.get(ce, {})
        conds = " ".join((c.get("en") or "") for c in r.get("conditions", []))
        ras = s["ras"]
        b, conf = brands.infer(s)
        out.append({"ce": ce, "en": (s.get("name") or "").strip(), "zh": s["nameChi"] if s.get("nameChi") not in (None, "\x00") else "",
                    "k": "银行" if s.get("isRi") else "VATP" if "VATP" in ras else "资管" if "T9" in ras else "券商" if "T1" in ras else "其他",
                    "ras": ras, "va": [n for n, p in VA_P if re.search(p, conds, re.I)],
                    "pi": "only provide services to professional investors" in conds,
                    "ro": len(r.get("ro", [])), "ri": bool(s.get("isRi")),
                    "pb": [b[0], b[1], conf[:1]] if b else None})
    meta = json.load(open(os.path.join(CUR, "META.json"), encoding="utf-8"))
    json.dump({"date": meta["date"], "firms": out}, open(os.path.join(SFC, "firms.json"), "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    log(f"firms.json：{len(out)} 家，带 VA 条件 {sum(1 for f in out if f['va'])}，VATP {sum(1 for f in out if f['k'] == 'VATP')}")


# ---------- 入口 ----------
def cmd_run():
    day = datetime.datetime.now(HKT).date().isoformat()
    work = os.path.join(SFC, "_work", day)  # 不入库；同一个 job 内失败重抓用
    os.makedirs(work, exist_ok=True)
    cj = session()
    cpath = os.path.join(work, "corps.json")
    corps = json.load(open(cpath, encoding="utf-8")) if os.path.exists(cpath) else pull_list(cj)
    json.dump(corps, open(cpath, "w", encoding="utf-8"), ensure_ascii=False)
    log(f"名单 {len(corps)} 家")
    epath = os.path.join(work, "enrich.jsonl")
    for attempt in range(3):  # 第一遍抓全，之后只重抓失败的
        enrich_all(cj, corps, epath)
        _, enrich = load(work)
        bad = [s for s in corps if not enrich.get(s["ceref"], {}).get("ok")]
        if not bad:
            break
        log(f"第 {attempt + 1} 遍后还有 {len(bad)} 家没抓到")
    missing = sum(1 for s in corps if s["ceref"] not in enrich)
    failed = sum(1 for r in enrich.values() if not r["ok"])
    log(f"条件页：{len(enrich)}/{len(corps)}，失败 {failed}，缺 {missing}")
    if missing:
        raise SystemExit("条件页不完整，不替换 current")
    with open(epath, "w", encoding="utf-8") as f:  # 去重后再存
        f.writelines(json.dumps(enrich[s["ceref"]], ensure_ascii=False) + "\n" for s in corps)
    if os.path.exists(os.path.join(CUR, "META.json")):
        old_day = json.load(open(os.path.join(CUR, "META.json"), encoding="utf-8"))["date"]
        if old_day != day:
            sig, skipped = diff(load(CUR), load(work), old_day, day)
            write_diff(old_day, day, sig, skipped)
            log(f"比对 {old_day} → {day}：{len(sig)} 条信号，跳过 {len(skipped)} 家")
    os.makedirs(CUR, exist_ok=True)
    for name in ("corps.json", "enrich.jsonl"):
        shutil.copy2(os.path.join(work, name), os.path.join(CUR, name))
    json.dump({"date": day}, open(os.path.join(CUR, "META.json"), "w", encoding="utf-8"))
    shutil.rmtree(os.path.join(SFC, "_work"), ignore_errors=True)
    write_firms()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "run":
        cmd_run()
    elif cmd == "firms":
        write_firms()
    else:
        print(__doc__)
