#!/usr/bin/env python3
"""
wiki-updater.py — 新闻触发 wiki 自动更新
每次运行：查 Supabase 新增高 alpha 新闻 → 追加到对应 wiki 文件
状态文件：alpha-radar/scripts/.wiki-update-state.json
"""
import os, json, sys, urllib.request, urllib.error
from pathlib import Path
from datetime import datetime, timezone

# ── 路径配置 ──
BASE = Path(__file__).parent.parent
WIKI_DIR = BASE / "wiki"
STATE_FILE = Path(__file__).parent / ".wiki-update-state.json"

# ── 从 .env 读取配置 ──
def load_env():
    env = {}
    for p in [Path.home() / ".hermes" / ".env", BASE / ".env"]:
        if p.exists():
            for line in p.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    env[k.strip()] = v.strip()
    env.update(os.environ)
    return env

ENV = load_env()
SUPABASE_URL  = ENV.get("SUPABASE_URL", "")
SUPABASE_KEY  = ENV.get("SUPABASE_ANON_KEY", "")
DEEPSEEK_KEY  = ENV.get("OPENAI_API_KEY", "")
DEEPSEEK_URL  = ENV.get("OPENAI_BASE_URL", "https://api.deepseek.com/v1")

# ── 新闻 → wiki 文件映射规则 ──
WIKI_ROUTES = [
    {
        "file": "竞品-HashKey.md",
        "section": "近期重要动作",
        "match": lambda n: n.get("source","") in ("HashKeyExchange","HashKeyGroup")
                        or "hashkey" in (n.get("title","")+""+n.get("detail","")).lower(),
    },
    {
        "file": "竞品-OSL.md",
        "section": "近期重要动作",
        "match": lambda n: n.get("source","") == "OSL"
                        or ("osl" in (n.get("title","")+""+n.get("detail","")).lower()
                            and n.get("alpha_score",0) >= 65),
    },
    {
        "file": "监管-香港SFC.md",
        "section": "最新监管动态",
        "match": lambda n: any(k in (n.get("business_category","") or "")
                               for k in ["合规","监管","牌照","稳定币"]),
    },
    {
        "file": "业务方向-RWA.md",
        "section": "最新 RWA 动态",
        "match": lambda n: "RWA" in (n.get("business_category","") or "")
                        or "代币化" in (n.get("title","") or ""),
    },
    {
        "file": "核心切入机会.md",
        "section": "高 Alpha 信号",
        "match": lambda n: (n.get("alpha_score",0) or 0) >= 80,
    },
]

def supabase_get(path):
    # encode + in timestamps to avoid URL parsing issues
    url = f"{SUPABASE_URL}/rest/v1/{path}".replace("+00:00", "%2B00:00")
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"[supabase] error: {e}", file=sys.stderr)
        return []

def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"last_processed_at": "2026-01-01T00:00:00+00:00"}

def save_state(state):
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2))

def ai_summarize(title, detail, wiki_context):
    """用 DeepSeek 生成一行 wiki 更新摘要（可选，失败时用原标题）"""
    if not DEEPSEEK_KEY:
        return title
    try:
        payload = json.dumps({
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content":
                 "你是 BitV 产品行研助手。根据新闻生成一行简洁的 wiki 更新条目（20字以内，中文），"
                 "聚焦对 BitV 的战略影响，不要重复标题原文。"},
                {"role": "user", "content":
                 f"新闻标题：{title}\n摘要：{(detail or '')[:300]}\n"
                 f"当前 wiki 上下文：{wiki_context[:200]}\n\n请生成一行更新条目（不加日期）："}
            ],
            "max_tokens": 60,
            "temperature": 0.3,
        }).encode()
        req = urllib.request.Request(
            f"{DEEPSEEK_URL}/chat/completions",
            data=payload,
            headers={"Authorization": f"Bearer {DEEPSEEK_KEY}",
                     "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            resp = json.loads(r.read())
            return resp["choices"][0]["message"]["content"].strip().strip("-").strip()
    except Exception as e:
        print(f"[ai] summarize failed: {e}", file=sys.stderr)
        return title[:50]

def ensure_section(content, section_title):
    """确保 wiki 文件有指定 section，没有则追加"""
    if f"## {section_title}" not in content:
        content = content.rstrip() + f"\n\n## {section_title}\n"
    return content

def append_to_section(wiki_path, section_title, entry_line):
    """在指定 section 下追加一行，避免重复"""
    content = wiki_path.read_text(encoding="utf-8") if wiki_path.exists() else ""
    content = ensure_section(content, section_title)

    # 避免重复（检查日期+关键词）
    date_str = entry_line[:12]  # `- [YYYY-MM-DD]`
    key = entry_line[13:30] if len(entry_line) > 30 else entry_line[13:]
    if key.strip() in content:
        return False  # 已存在

    # 在 section header 后插入
    lines = content.split("\n")
    new_lines = []
    inserted = False
    for i, line in enumerate(lines):
        new_lines.append(line)
        if not inserted and line.strip() == f"## {section_title}":
            new_lines.append(entry_line)
            inserted = True

    if not inserted:
        new_lines.append(entry_line)

    wiki_path.write_text("\n".join(new_lines), encoding="utf-8")
    return True

def main():
    state = load_state()
    last_at = state["last_processed_at"]

    print(f"[wiki-updater] 查询 {last_at} 之后的新闻...")

    # 查询新增高 alpha 新闻
    params = (
        f"news?select=title,detail,source,alpha_score,business_category,created_at"
        f"&alpha_score=gte.65"
        f"&created_at=gt.{last_at}"
        f"&order=created_at.asc&limit=50"
    )
    news_items = supabase_get(params)

    if not news_items:
        print("[wiki-updater] 无新增新闻")
        return

    print(f"[wiki-updater] 获取到 {len(news_items)} 条新闻")
    updated = 0
    latest_at = last_at

    for item in news_items:
        title   = item.get("title", "")
        detail  = item.get("detail", "") or ""
        score   = item.get("alpha_score", 0) or 0
        cat     = item.get("created_at", "")[:10]
        latest_at = max(latest_at, item.get("created_at", ""))

        for route in WIKI_ROUTES:
            if not route["match"](item):
                continue

            wiki_path = WIKI_DIR / route["file"]
            section   = route["section"]

            # 读取 wiki 上下文供 AI 参考
            ctx = ""
            if wiki_path.exists():
                content = wiki_path.read_text(encoding="utf-8")
                # 找到 section 后的前200字
                idx = content.find(f"## {section}")
                ctx = content[idx:idx+200] if idx >= 0 else content[:200]

            # 生成摘要
            summary = ai_summarize(title, detail, ctx)
            entry   = f"- [{cat}] {summary}（alpha={score}，来源：{item.get('source','')}）"

            ok = append_to_section(wiki_path, section, entry)
            if ok:
                print(f"  ✅ {route['file']} ← {entry[:60]}...")
                updated += 1

    # 保存状态
    if latest_at != last_at:
        save_state({"last_processed_at": latest_at,
                    "last_run": datetime.now(timezone.utc).isoformat()})

    print(f"[wiki-updater] 完成，更新 {updated} 条 wiki 条目")

if __name__ == "__main__":
    main()
