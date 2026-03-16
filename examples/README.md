# Alpha Radar 使用示例

本目录包含 Alpha Radar 的各种使用示例，帮助开发者快速上手。

## 文件说明

| 文件 | 说明 |
|------|------|
| `api-usage.js` | API 调用示例，展示如何查询新闻、统计数据、导出数据等 |
| `custom-scraper.js` | 自定义爬虫示例，展示如何添加新的数据源 |
| `webhook-integration.js` | Webhook 集成示例，展示如何接收推送和发送事件 |

## 运行示例

### 1. API 使用示例

```bash
# 设置环境变量
export API_URL=http://localhost:3001
export API_SECRET=your-api-secret

# 运行示例
node examples/api-usage.js
```

### 2. 自定义爬虫示例

```bash
# 注册并运行自定义爬虫
node examples/custom-scraper.js
```

### 3. Webhook 集成示例

```bash
# 启动 webhook 接收服务
export PORT=3002
export WEBHOOK_SECRET=your-webhook-secret
node examples/webhook-integration.js
```

## 更多示例

### 使用 curl 调用 API

```bash
# 获取新闻列表
curl http://localhost:3001/api/news?limit=10

# 搜索新闻
curl "http://localhost:3001/api/news?q=Bitcoin&limit=5"

# 获取统计数据
curl http://localhost:3001/api/stats

# 触发爬虫（需要 API Key）
curl -X POST -H "X-API-Key: your-secret" http://localhost:3001/api/refresh

# 导出 CSV
curl "http://localhost:3001/api/export?format=csv&days=7" > export.csv
```

### SSE 实时流

```javascript
const es = new EventSource('http://localhost:3001/api/stream');

es.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('New data:', data);
};
```

### Python 调用示例

```python
import requests

# 获取新闻
response = requests.get('http://localhost:3001/api/news', params={
    'limit': 20,
    'important': 1
})
data = response.json()
print(f"Got {len(data['data'])} news items")
```

## 注意事项

1. 示例中的 `localhost:3001` 需要替换为你的实际服务地址
2. 写操作（如触发爬虫）需要配置 `API_SECRET`
3. 生产环境建议使用 HTTPS
