"""新闻雷达：python intel/news_radar.py [--days 7]  → $INTEL_DATA/news/radar_news.json（GitHub Actions 每 2 小时跑）

源（均免费、免登录，2026-10-08 实测）：Google 新闻 RSS（简中 / 繁中 / 英文）、Bing 新闻 RSS（按日期排序）、SFC 新闻稿 RSS。
只存标题、媒体、链接、时间，不存正文。同一事件被多家报道 → 按标题相似度合并，报道家数 = 热度。
机构匹配用 brands.py + sfc/firms.json（sfc_snapshot.py 产出）。
"""
import datetime, email.utils, json, os, re, sys, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET

from rapidfuzz import fuzz
import zhconv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import brands  # noqa: E402

DATA = os.path.abspath(os.environ.get("INTEL_DATA", "data"))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36"

# (组, 关键词)。Google 关键词后面会自动加 when:Nd
QUERIES = [
    ("监管", "香港 虚拟资产 牌照"), ("监管", "证监会 虚拟资产 交易平台"), ("监管", "香港 稳定币 牌照"),
    ("监管", "Hong Kong SFC virtual asset licence"), ("监管", "Hong Kong stablecoin licence HKMA"),
    ("中资券商", "中资券商 虚拟资产 香港"), ("中资券商", "券商 香港 虚拟资产交易 升级"), ("中资券商", "中资券商 香港 内地客户"),
    ("竞品", "HashKey"), ("竞品", "OSL 数字资产"), ("竞品", "EX.IO 香港"), ("竞品", "HKbitEX OR 香港数字资产交易所"),
    ("RWA", "香港 RWA 代币化"), ("RWA", "Hong Kong tokenized fund"),
    ("机构需求", "家族办公室 加密资产 配置 香港"), ("机构需求", "Hong Kong family office crypto allocation"),
]
GOOGLE_EDITIONS = [("zh-CN", "CN", "CN:zh-Hans"), ("zh-HK", "HK", "HK:zh-Hant"), ("en-HK", "HK", "HK:en")]
SFC_RSS = "https://www.sfc.hk/en/RSS-Feeds/Press-releases"
VA_WORDS = re.compile(r"virtual asset|crypto|stablecoin|token|VATP|digital asset|虚拟资产|虛擬資產|稳定币|穩定幣|加密|代币|代幣|数字资产|數字資產", re.I)


def get(url):
    for attempt in range(3):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=25).read()
        except Exception:
            if attempt == 2:
                return b""
            time.sleep(2)


HKT = datetime.timezone(datetime.timedelta(hours=8))


def parse_ts(s):
    try:
        return email.utils.parsedate_to_datetime(s).astimezone(HKT).isoformat(timespec="minutes")
    except Exception:
        return ""


def parse_date(s):
    return parse_ts(s)[:10]


def items(xml):
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return []
    return root.iter("item")


def google(q, days):
    out = []
    for hl, gl, ceid in GOOGLE_EDITIONS:
        if (hl.startswith("en")) != bool(re.match(r"^[A-Za-z .]+$", q)):  # 中文词只查中文版，英文词只查英文版
            continue
        url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": f"{q} when:{days}d", "hl": hl, "gl": gl, "ceid": ceid})
        for it in items(get(url)):
            title, src = it.findtext("title", ""), it.findtext("source", "")
            if src and title.endswith(" - " + src):
                title = title[: -len(src) - 3]
            out.append({"title": title.strip(), "src": src, "url": it.findtext("link", ""), "date": parse_date(it.findtext("pubDate", "")), "ts": parse_ts(it.findtext("pubDate", "")), "via": "Google"})
    return out


def bing(q):
    url = "https://www.bing.com/news/search?" + urllib.parse.urlencode({"q": q, "format": "rss", "qft": 'sortbydate="1"'})
    out = []
    for it in items(get(url)):
        link = it.findtext("link", "")
        real = urllib.parse.parse_qs(urllib.parse.urlparse(link).query).get("url", [link])[0]  # 去掉 Bing 跳转
        src = next((c.text for c in it if c.tag.endswith("Source")), "") or urllib.parse.urlparse(real).netloc
        out.append({"title": it.findtext("title", "").strip(), "src": src, "url": real, "date": parse_date(it.findtext("pubDate", "")), "ts": parse_ts(it.findtext("pubDate", "")), "via": "Bing"})
    return out


def sfc():
    return [{"title": it.findtext("title", "").strip(), "src": "SFC", "url": it.findtext("link", ""), "date": parse_date(it.findtext("pubDate", "")),
             "ts": parse_ts(it.findtext("pubDate", "")), "via": "SFC", "ref": it.findtext("guid", "")} for it in items(get(SFC_RSS))]


RELEVANT = re.compile(VA_WORDS.pattern + r"|证监会|證監會|\bSFC\b|金管局|HKMA|财库局|財庫局|牌照|licen[cs]|RWA|tokeni[sz]|代币化|代幣化|券商|broker|"
                      r"家族办公室|家族辦公室|family office|托管|custod", re.I)


def key(title):
    t = zhconv.convert(title, "zh-cn").lower()
    return re.sub(r"[\s\W_]+", "", t)


def grams(title):
    """中文按字二元组、英文按词，标题改写多时比整句相似度稳。"""
    t = zhconv.convert(title, "zh-cn").lower()
    words = set(re.findall(r"[a-z0-9]{2,}", t))
    zh = re.sub(r"[^一-鿿]", "", t)
    return words | {zh[i:i + 2] for i in range(len(zh) - 1)}


JACCARD = 0.3  # 0.4 时「中资券商收紧内地 IP」被拆成 4 条；0.3 抽查无误并


def days_apart(a, b):
    return abs((datetime.date.fromisoformat(a) - datetime.date.fromisoformat(b)).days)


def cluster(articles):
    """同一事件：标题二元组 Jaccard ≥ JACCARD（或整句相似 ≥ 80），且日期相差 ≤ 3 天。"""
    stories = []
    for a in sorted(articles, key=lambda r: r["date"]):
        k, g = key(a["title"]), grams(a["title"])
        if len(k) < 6 or not g:
            continue
        best, score = None, 0
        for s in stories:
            if days_apart(a["date"], s["last"]) > 3:
                continue
            j = max(len(g & sg) / len(g | sg) for sg in s["grams"])
            j = max(j, fuzz.ratio(k, s["k"]) / 100 * 0.5)
            if j > score:
                best, score = s, j
        if best and score >= JACCARD:
            if a["url"] not in {x["url"] for x in best["articles"]}:
                best["articles"].append(a)
            best["topics"] |= a["topics"]
            best["grams"].append(g)
            best["last"] = max(best["last"], a["date"])
        else:
            stories.append({"k": k, "grams": [g], "articles": [a], "topics": set(a["topics"]), "last": a["date"]})
    return stories


def load_firms():
    """firms: {ce: 摘要}；parent: {内地母品牌: [ce]}（只用高 / 中置信）。"""
    path = os.path.join(DATA, "sfc", "firms.json")
    if not os.path.exists(path):
        return {}, {}
    fs = json.load(open(path, encoding="utf-8"))["firms"]
    firms = {f["ce"]: {k: f[k] for k in ("ce", "en", "zh", "ras", "va")} for f in fs}
    parent = {}
    for f in fs:
        if f["pb"] and f["pb"][2] in ("高", "中"):
            parent.setdefault(f["pb"][0], []).append(f["ce"])
    return firms, parent


def role_of(st):
    """线索 = 提到了内地机构且能落到具体持牌主体；竞品动态 > 监管 > 中资券商动态 > 资讯。"""
    if any(h["kind"] != "竞品" and h["firms"] for h in st["hits"]) and "机构需求" not in st["topics"]:
        return "线索"
    if any(h["kind"] == "竞品" for h in st["hits"]):
        return "竞品动态"
    if st["sfc"] or "监管" in st["topics"]:
        return "监管"
    if st["topics"] == ["SFC 其他"]:
        return "SFC 其他"
    return "中资券商动态" if "中资券商" in st["topics"] else "资讯"


def main():
    days = int(sys.argv[sys.argv.index("--days") + 1]) if "--days" in sys.argv else 7
    now = datetime.datetime.now(HKT)
    since = (now.date() - datetime.timedelta(days=days)).isoformat()
    comp = [x for x in brands.text_patterns() if x[1] == "竞品"]
    raw, log = [], []
    for topic, q in QUERIES:
        got = google(q, days) + bing(q)
        kept = [dict(a, topics={topic}) for a in got if a["date"] >= since and a["title"]
                and (RELEVANT.search(a["title"]) or any(rx.search(a["title"]) for b, k, rx in comp))]
        log.append({"topic": topic, "q": q, "fetched": len(got), "in_window": len(kept)})
        raw += kept
        time.sleep(1)
    s_items = [a for a in sfc() if a["date"] >= since]
    for a in s_items:
        a["topics"] = {"监管"} if VA_WORDS.search(a["title"]) else {"SFC 其他"}
    raw += s_items
    log.append({"topic": "SFC 新闻稿", "q": SFC_RSS, "fetched": len(s_items), "in_window": len(s_items)})

    firms, parent = load_firms()
    pats = brands.text_patterns()
    stories = []
    for s in cluster(raw):
        arts = sorted(s["articles"], key=lambda a: (a["via"] != "SFC", a["date"]))
        lead = arts[0]
        st = {"id": s["k"][:40], "title": lead["title"], "date": min(a["date"] for a in arts), "last": max(a["date"] for a in arts),
              "ts": max(a["ts"] for a in arts), "topics": sorted(s["topics"]), "n": len({a["src"] for a in arts}),
              "articles": [{k: a[k] for k in ("title", "src", "url", "date", "ts", "via")} for a in arts[:8]],
              "sfc": lead["via"] == "SFC"}
        # 匹配只用标题，不带媒体名
        st["hits"] = brands.text_hits(" / ".join(a["title"] for a in arts), pats, firms, parent)
        st["role"] = role_of(st)
        stories.append(st)
    stories.sort(key=lambda r: (r["last"], r["n"]), reverse=True)
    os.makedirs(os.path.join(DATA, "news"), exist_ok=True)
    out = {"built": now.isoformat(timespec="minutes"), "since": since, "log": log, "articles": len(raw), "stories": stories}
    json.dump(out, open(os.path.join(DATA, "news", "radar_news.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    roles = {}
    for st in stories:
        roles[st["role"]] = roles.get(st["role"], 0) + 1
    print(f"报道 {len(raw)} 篇 → 事件 {len(stories)} 条 · {roles} · 机构库 {len(firms)} 家")


if __name__ == "__main__":
    main()
