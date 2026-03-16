# Alpha-Radar 快速启动指南

## 🚀 30 秒快速启动

### Windows 用户

1. **双击运行**:
   ```
   quick-setup.bat
   ```

2. **编辑 `.env` 文件**（可选但推荐）:
   - 填入 `DEEPSEEK_API_KEY`
   - 填入推送渠道 Webhook（如企业微信）

3. **启动服务**:
   ```bash
   npm start
   ```

4. **访问前端**:
   ```
   http://localhost:3001
   ```

---

### macOS/Linux 用户

1. **运行安装脚本**:
   ```bash
   ./setup.sh
   ```

2. **编辑 `.env` 文件**:
   ```bash
   cp .env.example .env
   # 编辑 .env 填入 API Key
   ```

3. **启动服务**:
   ```bash
   npm start
   ```

4. **访问前端**:
   ```
   http://localhost:3001
   ```

---

## 📋 配置检查清单

### ✅ 必需配置

- [ ] `DEEPSEEK_API_KEY` - DeepSeek AI API Key
  - 获取地址：https://platform.deepseek.com/

### ✅ 推送渠道（至少配置一个）

- [ ] 企业微信（推荐）
  - 创建机器人：https://work.weixin.qq.com/wework_admin/frame#apps
  - 复制 Webhook URL 到 `.env`

- [ ] 飞书（国内团队推荐）
  - 创建机器人：https://open.feishu.cn/document/ukTMukTMukTM/ucTM5YjL3ETO24yNxkjN
  - 复制 Webhook URL 和 Secret 到 `.env`

- [ ] ntfy（个人用户推荐）
  - 无需注册，直接使用
  - 设置 topic 名称即可

- [ ] Bark（iOS 用户推荐）
  - 下载 App：https://apps.apple.com/app/id1403753865
  - 复制 Device Key 到 `.env`

---

## 🔧 MCP Server 配置（可选）

让 Claude Desktop/Cursor 能用自然语言查询情报

### 步骤 1：安装依赖

```bash
cd mcp-server
npm install
```

### 步骤 2：配置 Claude Desktop

**Windows**: 编辑 `%APPDATA%\Claude\claude_desktop_config.json`

**macOS**: 编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`

添加配置：

```json
{
  "mcpServers": {
    "alpha-radar": {
      "command": "node",
      "args": ["server.js"],
      "cwd": "C:/Users/lenovo/alpha-radar/mcp-server",
      "env": {
        "API_BASE_URL": "http://localhost:3001/api",
        "API_SECRET": ""
      }
    }
  }
}
```

### 步骤 3：重启 Claude Desktop

### 步骤 4：开始对话

在 Claude Desktop 中输入：

```
获取过去 24 小时最重要的香港合规新闻
```

```
搜索所有提到 SFC 和牌照的新闻
```

```
过去一周各分类的情报数量分布如何？
```

---

## 🧪 测试功能

### 测试 MCP Server

```bash
npm run test:mcp
```

### 测试推送

```bash
npm run test-push
```

### 查看推送渠道状态

```bash
node -e "const {pushManager} = require('./push-channel'); console.log(pushManager.getStatus())"
```

---

## 📊 数据库初始化

首次运行时会自动创建 SQLite 数据库：

```
alpha_radar.db
```

如果手动初始化：

```bash
node -e "const {db} = require('./db'); console.log('数据库就绪')"
```

---

## 🐛 故障排除

### 问题：无法启动服务

**检查 Node.js 版本**:
```bash
node --version
# 需要 v20+
```

**重新安装依赖**:
```bash
rm -rf node_modules package-lock.json
npm install
```

### 问题：MCP Server 不工作

**检查日志**:
```bash
cd mcp-server
node server.js 2>&1 | tee mcp.log
```

**检查连接**:
```bash
curl http://localhost:3001/api/news?limit=1
```

### 问题：推送失败

**检查环境变量**:
```bash
# .env
WECOM_WEBHOOK_URL=https://...
```

**测试单条推送**:
```bash
npm run test-push
```

---

## 📚 更多文档

- `OPTIMIZATION_COMPLETE.md` - 完整优化报告
- `mcp-server/README.md` - MCP Server 详细文档
- `FRONTEND_BUILD.md` - 前端构建指南
- `CHANGELOG.md` - 更新日志

---

## 🎯 下一步

1. **配置数据源** - 编辑 `config.js` 自定义抓取频率
2. **设置定时任务** - 配置 GitHub Actions 或 node-cron
3. **自定义 AI 提示词** - 编辑 `ai-enhanced.js` 调整分类逻辑
4. **部署到 Vercel** - 参考 README.md 的部署指南

---

*快速启动指南 v2.1.0 | 更新时间：2026-03-17*
