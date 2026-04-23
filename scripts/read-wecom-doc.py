#!/usr/bin/env python3
"""
read-wecom-doc.py — 通过 wecom-cli 读取企业微信文档/智能表格内容
用法：python3 read-wecom-doc.py --url "https://doc.weixin.qq.com/..."
注意：必须在 WSL 中运行，脚本通过 cmd.exe 调用 Windows 侧 wecom-cli
"""
import argparse, json, subprocess, sys, time
from pathlib import Path


_WECOM_JS = "C:/Users/lenovo/AppData/Roaming/npm/node_modules/@wecom/cli/bin/wecom.js"


def wecom_call(subcommand: str, args_dict: dict, timeout: int = 30) -> dict:
    json_content = json.dumps(args_dict, ensure_ascii=False, separators=(',', ':'))
    try:
        result = subprocess.run(
            ["node.exe", _WECOM_JS, "doc", subcommand, "--json", json_content],
            capture_output=True, timeout=timeout
        )
        raw = result.stdout.strip()
        if not raw:
            err = result.stderr.decode('utf-8', errors='replace').strip()
            return {"error": err or "no output from wecom-cli"}
        output = raw.decode('utf-8', errors='replace')
        mcp = json.loads(output)
        text = mcp.get("result", {}).get("content", [{}])[0].get("text", "{}")
        if not text or text == "{}":
            text = mcp.get("content", [{}])[0].get("text", "{}")
        return json.loads(text)
    except subprocess.TimeoutExpired:
        return {"error": f"timeout after {timeout}s"}
    except json.JSONDecodeError as e:
        return {"error": f"json parse error: {e}"}
    except Exception as e:
        return {"error": str(e)}


def check_errcode(resp: dict) -> bool:
    """返回 True 表示有错误，打印错误信息"""
    code = resp.get("errcode", 0)
    if code == 0:
        return False
    msg = resp.get("errmsg", "")
    if code == 851008:
        print("❌ Bot 未授权「获取成员文档内容」权限")
        print("   → 企微内：工作台 → 智能机器人 → Hermes → 申请文档权限")
    elif code == 851014:
        print("❌ Bot 文档权限已过期，需重新授权")
        print("   → 企微内：工作台 → 智能机器人 → Hermes → 重新授权")
    else:
        print(f"❌ API 错误 {code}: {msg}")
    return True


def get_regular_doc(url: str) -> str:
    """读取普通文档（/doc/ URL），异步轮询"""
    print(f"📄 读取文档（async 轮询）: {url}")
    resp = wecom_call("get_doc_content", {"url": url, "type": 2})
    if check_errcode(resp):
        return ""
    if resp.get("task_done"):
        content = resp.get("content", "")
        print(f"✅ {len(content)} 字符")
        return content
    task_id = resp.get("task_id")
    if not task_id:
        print(f"❌ 无 task_id，响应: {resp}")
        return ""
    print(f"⏳ task_id={task_id}，轮询中...")
    for i in range(8):
        time.sleep(2)
        resp = wecom_call("get_doc_content", {"url": url, "type": 2, "task_id": task_id})
        if check_errcode(resp):
            return ""
        if resp.get("task_done"):
            content = resp.get("content", "")
            print(f"✅ {len(content)} 字符（第 {i+1} 次轮询）")
            return content
        print(f"   轮询 {i+1}/8...")
    print("❌ 轮询超时")
    return ""


def get_smartsheet(url: str) -> str:
    """读取智能表格（/smartsheet/ URL）"""
    print(f"📊 读取智能表格: {url}")

    # 第一步：获取子表列表
    resp = wecom_call("smartsheet_get_sheet", {"url": url})
    if check_errcode(resp):
        return ""
    sheets = resp.get("sheet_list", [])
    if not sheets:
        print(f"❌ 无子表，响应: {resp}")
        return ""
    print(f"✅ {len(sheets)} 个子表")

    lines = [f"# 智能表格\n来源: {url}\n"]
    for sheet in sheets[:5]:  # 最多读 5 个子表
        sheet_id = sheet.get("sheet_id") or sheet.get("id")
        sheet_title = sheet.get("title", sheet_id)
        print(f"  📋 读取子表: {sheet_title} ({sheet_id})")

        # 获取字段
        fields_resp = wecom_call("smartsheet_get_fields", {"url": url, "sheet_id": sheet_id})
        if check_errcode(fields_resp):
            continue
        fields = fields_resp.get("fields", [])
        field_names = [f.get("field_title", f.get("title", "?")) for f in fields]

        # 获取记录
        records_resp = wecom_call("smartsheet_get_records", {"url": url, "sheet_id": sheet_id})
        if check_errcode(records_resp):
            continue
        records = records_resp.get("records", [])
        print(f"     {len(fields)} 列 × {len(records)} 行")

        lines.append(f"\n## {sheet_title}\n")
        if field_names:
            lines.append("| " + " | ".join(field_names) + " |")
            lines.append("|" + "---|" * len(field_names))
        for rec in records[:100]:  # 最多 100 行
            row_data = rec.get("values", rec.get("record", rec.get("fields", {})))
            row = []
            for fname in field_names:
                val = row_data.get(fname, "")
                if isinstance(val, list):
                    # 每项可能是 {"text":"..."} 或 {"id":"...","text":"..."}
                    parts = []
                    for item in val:
                        if isinstance(item, dict):
                            parts.append(item.get("text", ""))
                        else:
                            parts.append(str(item))
                    val = "".join(parts)
                elif isinstance(val, str) and val.isdigit() and len(val) == 13:
                    # 毫秒时间戳 → 日期
                    from datetime import datetime, timezone
                    val = datetime.fromtimestamp(int(val)/1000, tz=timezone.utc).strftime("%Y-%m-%d")
                row.append(str(val).replace("|", "｜").replace("\n", " ").strip())
            lines.append("| " + " | ".join(row) + " |")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True, help="企微文档/智能表格 URL")
    parser.add_argument("--save", help="保存到文件路径（可选）")
    args = parser.parse_args()

    url = args.url
    if "/smartsheet/" in url:
        content = get_smartsheet(url)
    else:
        content = get_regular_doc(url)

    if not content:
        print("❌ 未获取到内容")
        sys.exit(1)

    print(f"\n--- 内容预览 (前1000字) ---\n{content[:1000]}")

    if args.save:
        Path(args.save).write_text(content, encoding="utf-8")
        print(f"\n✅ 已保存到: {args.save}")


if __name__ == "__main__":
    main()
