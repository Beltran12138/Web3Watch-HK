# Alpha-Radar MCP Server

让 Claude Desktop、Cursor 等 AI 客户端能用自然语言查询你的行业情报系统。

## 功能

### 工具 (Tools)

| 工具名 | 描述 |
|--------|------|
| `get_latest_news` | 获取最新高价值情报，支持分类/来源/时间过滤 |
| `search_news` | 根据关键词搜索新闻 |
| `get_stats` | 获取统计数据（分类分布、趋势分析） |
| `push_message` | 发送推送消息到所有渠道 |

### 资源 (Resources)

| URI | 描述 |
|-----|------|
| `news://recent` | 最近 24 小时内的高价值情报 |
| `news://categories` | 所有业务分类列表 |

---

## 安装

### 方式 A：Claude Desktop

1. **安装 Node.js 依赖**
   ```bash
   cd mcp-server
   npm install
   ```

2. **配置 Claude Desktop**
   
   打开 Claude Desktop 配置文件：
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   
   添加以下配置：
   ```json
   {
     "mcpServers": {
       "alpha-radar": {
         "command": "node",
         "args": ["server.js"],
         "cwd": "C:/Users/lenovo/alpha-radar/mcp-server",
         "env": {
           "API_BASE_URL": "http://localhost:3001/api",
           "API_SECRET": "your-api-secret"
         }
       }
     }
   }
   ```

3. **重启 Claude Desktop**

4. **开始使用**
   
   在对话框中输入：
   - "获取最新的合规相关新闻"
   - "搜索关于 SFC 的新闻"
   - "过去 7 天的情报统计"

---

### 方式 B：Cursor IDE

1. **安装依赖**
   ```bash
   cd mcp-server
   npm install
   ```

2. **配置 Cursor**
   
   在项目根目录创建 `.cursor/mcp.json`:
   ```json
   {
     "mcpServers": {
       "alpha-radar": {
         "command": "node",
         "args": ["server.js"],
         "cwd": "${workspaceFolder}/mcp-server",
         "env": {
           "API_BASE_URL": "http://localhost:3001/api"
         }
       }
     }
   }
   ```

3. **重启 Cursor**

---

## 使用示例

### 获取最新新闻

```
获取过去 24 小时最重要的新闻，只关心香港合规相关的
```

### 搜索特定话题

```
搜索所有提到"SFC"和"牌照"的新闻
```

### 查看统计

```
过去一周各分类的情报数量分布如何？
```

### 发送推送

```
发送紧急通知：SFC 发布新的虚拟资产交易平台指引
```

---

## API 参数说明

### get_latest_news

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| limit | number | 20 | 返回数量上限 |
| category | string | - | 分类过滤（合规/技术/市场等） |
| source | string | - | 来源过滤（Binance/OKX/HashKey 等） |
| min_score | number | 60 | 最低 alpha_score 阈值 |
| hours | number | 24 | 时间范围（过去多少小时） |

### search_news

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| query | string | - | 搜索关键词 |
| limit | number | 10 | 返回数量上限 |

### get_stats

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| days | number | 7 | 统计天数 |

### push_message

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| title | string | - | 消息标题 |
| content | string | - | 消息内容（支持 Markdown） |
| urgent | boolean | false | 是否紧急推送 |

---

## 故障排除

### 问题：Claude Desktop 无法连接 MCP Server

**解决方案**：
1. 确保主服务已启动：`npm start`
2. 检查 `API_BASE_URL` 配置是否正确
3. 查看日志：`tail -f ~/Library/Logs/Claude/*.log`

### 问题：工具调用返回空数据

**解决方案**：
1. 确认数据库有数据：访问 http://localhost:3001/api/news
2. 检查 `min_score` 阈值是否过高
3. 尝试扩大时间范围（hours 参数）

---

## 开发调试

### 测试 MCP Server

```bash
cd mcp-server
npm test
```

### 手动调用工具

```javascript
const { getLatestNews, searchNews } = require('./index');

// 获取最新新闻
const news = await getLatestNews({ 
  limit: 10, 
  category: '合规',
  min_score: 70 
});
console.log(news);

// 搜索新闻
const results = await searchNews({ 
  query: 'SFC 牌照',
  limit: 5 
});
console.log(results);
```

---

## 许可证

MIT © Alpha-Radar Team
