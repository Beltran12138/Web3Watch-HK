#!/usr/bin/env python3
"""
wecom-mcp-server.py — 把 wecom-cli doc 命令包装为 MCP stdio server
Hermes 通过 `hermes mcp add wecom --command python3 --args ...` 注册后可直接调用
"""
import json, subprocess, sys, os, uuid

TOOLS = [
    {
        "name": "wecom_read_doc",
        "description": "读取企业微信文档或智能表格内容。自动判断 URL 类型：/smartsheet/ 读表格，/doc/ 读普通文档。返回 Markdown 格式内容。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "企业微信文档或智能表格完整 URL"}
            },
            "required": ["url"]
        }
    },
    {
        "name": "wecom_create_doc",
        "description": "新建企业微信文档或智能表格。doc_type=3 创建普通文档，doc_type=10 创建智能表格。返回文档 URL 和 docid（docid 需妥善保存，仅在创建时返回）。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "doc_name": {"type": "string", "description": "文档名称，最多 255 字符"},
                "doc_type": {"type": "integer", "enum": [3, 10], "description": "3=普通文档，10=智能表格"}
            },
            "required": ["doc_name", "doc_type"]
        }
    },
    {
        "name": "wecom_edit_doc",
        "description": "编辑企业微信文档内容，传入 Markdown 格式内容。支持 docid 或 URL 定位文档。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "Markdown 格式的文档内容"},
                "docid": {"type": "string", "description": "文档 docid（与 url 二选一）"},
                "url": {"type": "string", "description": "文档 URL（与 docid 二选一）"}
            },
            "required": ["content"]
        }
    },
    {
        "name": "wecom_smartsheet_add_records",
        "description": "向企业微信智能表格子表添加一行或多行记录。每条记录的 key 必须是字段标题（field_title），可通过 wecom_read_doc 或 wecom_smartsheet_get_fields 查看字段名。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "智能表格 URL（与 docid 二选一）"},
                "docid": {"type": "string", "description": "文档 docid（与 url 二选一）"},
                "sheet_id": {"type": "string", "description": "子表 ID"},
                "records": {
                    "type": "array",
                    "description": "记录列表，每条记录为 {字段标题: 值} 的对象",
                    "items": {"type": "object"}
                }
            },
            "required": ["sheet_id", "records"]
        }
    },
    {
        "name": "wecom_smartsheet_setup_fields",
        "description": "设置智能表格子表的字段结构：先重命名默认字段，再添加其余字段。新建子表必须先调用此工具初始化字段，否则会多出无用默认列。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "智能表格 URL（与 docid 二选一）"},
                "docid": {"type": "string", "description": "文档 docid（与 url 二选一）"},
                "sheet_id": {"type": "string", "description": "子表 ID"},
                "field_names": {
                    "type": "array",
                    "description": "字段名称列表（按顺序），第一个会替换默认字段",
                    "items": {"type": "string"}
                }
            },
            "required": ["sheet_id", "field_names"]
        }
    },
    {
        "name": "wecom_get_doc_content",
        "description": "获取企业微信在线 doc 文档完整内容（Markdown 格式），异步轮询直到完成。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "文档 URL"},
                "task_id": {"type": "string", "description": "异步轮询 task_id（首次调用无需传）"}
            },
            "required": ["url"]
        }
    },
    {
        "name": "wecom_smartsheet_get_records",
        "description": "获取企业微信智能表格指定子表的所有记录行。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "智能表格 URL"},
                "sheet_id": {"type": "string", "description": "子表 ID（通过 wecom_smartsheet_get_sheet 获取）"}
            },
            "required": ["url", "sheet_id"]
        }
    },
    {
        "name": "wecom_smartsheet_get_sheet",
        "description": "获取企业微信智能表格的子表列表（sheet_id 和标题）。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "智能表格 URL"}
            },
            "required": ["url"]
        }
    },
    {
        "name": "wecom_smartsheet_get_fields",
        "description": "获取企业微信智能表格子表的字段定义（列名、类型等）。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "智能表格 URL"},
                "sheet_id": {"type": "string", "description": "子表 ID"}
            },
            "required": ["url", "sheet_id"]
        }
    }
]


_WECOM_JS = "C:/Users/lenovo/AppData/Roaming/npm/node_modules/@wecom/cli/bin/wecom.js"


def wecom_call(subcommand: str, args_dict: dict, timeout: int = 60) -> dict:
    # Call node.exe directly with args as list — no shell quoting, no cmd.exe length limit,
    # no encoding issues. WSL interop passes args directly to Windows exe via CreateProcessW.
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
    except Exception as e:
        return {"error": str(e)}


def read_smartsheet(url: str) -> str:
    resp = wecom_call("smartsheet_get_sheet", {"url": url})
    if resp.get("errcode", 0) != 0:
        return f"Error {resp.get('errcode')}: {resp.get('errmsg', '')}"
    sheets = resp.get("sheet_list", [])
    if not sheets:
        return "No sheets found"
    lines = [f"# 智能表格\n来源: {url}\n"]
    for sheet in sheets[:5]:
        sheet_id = sheet.get("sheet_id") or sheet.get("id")
        sheet_title = sheet.get("title", sheet_id)
        fields_resp = wecom_call("smartsheet_get_fields", {"url": url, "sheet_id": sheet_id})
        fields = fields_resp.get("fields", [])
        field_names = [f.get("field_title", f.get("title", "?")) for f in fields]
        records_resp = wecom_call("smartsheet_get_records", {"url": url, "sheet_id": sheet_id})
        records = records_resp.get("records", [])
        lines.append(f"\n## {sheet_title}\n")
        if field_names:
            lines.append("| " + " | ".join(field_names) + " |")
            lines.append("|" + "---|" * len(field_names))
        for rec in records[:200]:
            row_data = rec.get("values", rec.get("record", rec.get("fields", {})))
            row = []
            for fname in field_names:
                val = row_data.get(fname, "")
                if isinstance(val, list):
                    parts = []
                    for item in val:
                        if isinstance(item, dict):
                            parts.append(item.get("text", ""))
                        else:
                            parts.append(str(item))
                    val = "".join(parts)
                elif isinstance(val, str) and val.isdigit() and len(val) == 13:
                    from datetime import datetime, timezone
                    val = datetime.fromtimestamp(int(val)/1000, tz=timezone.utc).strftime("%Y-%m-%d")
                row.append(str(val).replace("|", "｜").replace("\n", " ").strip())
            lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


def read_doc(url: str) -> str:
    import time
    resp = wecom_call("get_doc_content", {"url": url, "type": 2})
    if resp.get("errcode", 0) != 0:
        code = resp.get("errcode", 0)
        if code == 851008:
            return "错误 851008：Bot 未授权「获取成员文档内容」权限，请在企微工作台重新授权"
        if code == 851014:
            return "错误 851014：文档权限已过期，请在企微工作台重新授权"
        return f"Error {code}: {resp.get('errmsg', '')}"
    if resp.get("task_done"):
        return resp.get("content", "")
    task_id = resp.get("task_id", "")
    if not task_id:
        return f"No task_id, response: {resp}"
    for i in range(10):
        time.sleep(2)
        resp = wecom_call("get_doc_content", {"url": url, "type": 2, "task_id": task_id})
        if resp.get("errcode", 0) != 0:
            return f"Error {resp.get('errcode')}: {resp.get('errmsg', '')}"
        if resp.get("task_done"):
            return resp.get("content", "")
    return "Timeout waiting for doc content"


def setup_sheet_fields(url_or_docid: dict, sheet_id: str, field_names: list) -> str:
    """初始化子表字段：重命名默认字段 + 添加其余字段"""
    fields_resp = wecom_call("smartsheet_get_fields", {**url_or_docid, "sheet_id": sheet_id})
    if fields_resp.get("errcode", 0) != 0:
        return f"get_fields error: {fields_resp.get('errmsg', '')}"
    fields = fields_resp.get("fields", [])
    if not fields:
        return "No default field found"
    default_field_id = fields[0].get("field_id")
    default_field_type = fields[0].get("field_type", "FIELD_TYPE_TEXT")

    # Step 1: rename default field to first desired field
    update_resp = wecom_call("smartsheet_update_fields", {
        **url_or_docid,
        "sheet_id": sheet_id,
        "fields": [{"field_id": default_field_id, "field_title": field_names[0], "field_type": default_field_type}]
    })
    if update_resp.get("errcode", 0) != 0:
        return f"update_fields error: {update_resp.get('errmsg', '')}"

    # Step 2: add remaining fields
    if len(field_names) > 1:
        add_resp = wecom_call("smartsheet_add_fields", {
            **url_or_docid,
            "sheet_id": sheet_id,
            "fields": [{"field_title": name, "field_type": "FIELD_TYPE_TEXT"} for name in field_names[1:]]
        })
        if add_resp.get("errcode", 0) != 0:
            return f"add_fields error: {add_resp.get('errmsg', '')}"

    return f"OK: fields set to {field_names}"


def handle_tool_call(name: str, args: dict) -> str:
    if name == "wecom_read_doc":
        url = args.get("url", "")
        if "/smartsheet/" in url:
            return read_smartsheet(url)
        else:
            return read_doc(url)

    elif name == "wecom_create_doc":
        resp = wecom_call("create_doc", {
            "doc_type": args.get("doc_type", 3),
            "doc_name": args.get("doc_name", "新文档")
        })
        return json.dumps(resp, ensure_ascii=False)

    elif name == "wecom_edit_doc":
        call_args = {"content": args.get("content", ""), "content_type": 1}
        if args.get("docid"):
            call_args["docid"] = args["docid"]
        elif args.get("url"):
            call_args["url"] = args["url"]
        resp = wecom_call("edit_doc_content", call_args)
        return json.dumps(resp, ensure_ascii=False)

    elif name == "wecom_smartsheet_add_records":
        loc = {}
        if args.get("url"):
            loc["url"] = args["url"]
        elif args.get("docid"):
            loc["docid"] = args["docid"]
        # Convert simplified {field: value} records to API format {values: {field: cell_value}}
        # String → [{"type":"text","text":"..."}], number/bool → direct, already-wrapped → pass through
        def to_cell(v):
            if isinstance(v, (int, float, bool)):
                return v
            if isinstance(v, list):
                return v  # already in cell format
            return [{"type": "text", "text": str(v)}]
        raw_records = args.get("records", [])
        api_records = []
        for rec in raw_records:
            if "values" in rec:
                api_records.append(rec)  # already wrapped
            else:
                api_records.append({"values": {k: to_cell(v) for k, v in rec.items()}})
        resp = wecom_call("smartsheet_add_records", {
            **loc,
            "sheet_id": args.get("sheet_id", ""),
            "records": api_records
        })
        return json.dumps(resp, ensure_ascii=False)

    elif name == "wecom_smartsheet_setup_fields":
        loc = {}
        if args.get("url"):
            loc["url"] = args["url"]
        elif args.get("docid"):
            loc["docid"] = args["docid"]
        return setup_sheet_fields(loc, args.get("sheet_id", ""), args.get("field_names", []))

    elif name == "wecom_get_doc_content":
        url = args.get("url", "")
        task_id = args.get("task_id")
        call_args = {"url": url, "type": 2}
        if task_id:
            call_args["task_id"] = task_id
        resp = wecom_call("get_doc_content", call_args)
        return json.dumps(resp, ensure_ascii=False)

    elif name == "wecom_smartsheet_get_records":
        url = args.get("url", "")
        sheet_id = args.get("sheet_id", "")
        resp = wecom_call("smartsheet_get_records", {"url": url, "sheet_id": sheet_id})
        return json.dumps(resp, ensure_ascii=False)

    elif name == "wecom_smartsheet_get_sheet":
        url = args.get("url", "")
        resp = wecom_call("smartsheet_get_sheet", {"url": url})
        return json.dumps(resp, ensure_ascii=False)

    elif name == "wecom_smartsheet_get_fields":
        url = args.get("url", "")
        sheet_id = args.get("sheet_id", "")
        resp = wecom_call("smartsheet_get_fields", {"url": url, "sheet_id": sheet_id})
        return json.dumps(resp, ensure_ascii=False)

    else:
        return f"Unknown tool: {name}"


def send(obj: dict):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue

        req_id = req.get("id")
        method = req.get("method", "")

        if method == "initialize":
            send({
                "jsonrpc": "2.0", "id": req_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "wecom-mcp", "version": "1.1.0"}
                }
            })
        elif method == "tools/list":
            send({"jsonrpc": "2.0", "id": req_id, "result": {"tools": TOOLS}})
        elif method == "tools/call":
            params = req.get("params", {})
            tool_name = params.get("name", "")
            tool_args = params.get("arguments", {})
            content = handle_tool_call(tool_name, tool_args)
            send({
                "jsonrpc": "2.0", "id": req_id,
                "result": {"content": [{"type": "text", "text": content}]}
            })
        elif method == "notifications/initialized":
            pass
        else:
            if req_id is not None:
                send({"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Method not found: {method}"}})


if __name__ == "__main__":
    main()
