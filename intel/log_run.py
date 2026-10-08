"""把一次采集的结果追加到 $INTEL_DATA/runs.jsonl：python intel/log_run.py news|sfc <开始时间> <是否成功>
由 intel_news.yml / intel_sfc.yml 在最后一步调用（失败也记）。下游页面的「数据更新」读这份流水。"""
import datetime, json, os, sys

DATA = os.path.abspath(os.environ.get("INTEL_DATA", "data"))


def count(job):
    if job == "news":
        r = json.load(open(os.path.join(DATA, "news", "radar_news.json"), encoding="utf-8"))
        return {"n": r["articles"], "stories": len(r["stories"])}
    day = json.load(open(os.path.join(DATA, "sfc", "current", "META.json"), encoding="utf-8"))["date"]
    n = sum(1 for _ in open(os.path.join(DATA, "sfc", "current", "enrich.jsonl"), encoding="utf-8"))
    diff = os.path.join(DATA, "sfc", "diffs", day + ".json")
    sig = len(json.load(open(diff, encoding="utf-8"))["signals"]) if os.path.exists(diff) else 0
    return {"n": n, "signals": sig, "snapshot": day}


def main():
    job, start, ok = sys.argv[1], sys.argv[2], sys.argv[3] == "true"
    row = {"job": job, "start": start, "end": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "ok": ok, "via": "actions"}
    try:
        row.update(count(job))
    except Exception as e:
        row["count_error"] = str(e)[:200]
    with open(os.path.join(DATA, "runs.jsonl"), "a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(row)


if __name__ == "__main__":
    main()
