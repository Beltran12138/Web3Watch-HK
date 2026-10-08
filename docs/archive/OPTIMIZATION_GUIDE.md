# Alpha Radar - 后续优化实施指南

本文档详细说明了如何执行项目优化的后续建议。

---

## 📋 目录

1. [数据清洗脚本](#1-数据清洗脚本)
2. [Supabase RPC 函数](#2-supabase-rpc-函数)
3. [Redis 缓存集成](#3-redis-缓存集成)
4. [监控面板](#4-监控面板)
5. [使用示例](#5-使用示例)

---

## 1. 数据清洗脚本

### 功能说明
`clean-database.js` 用于清理数据库中的乱码数据、修复无效时间戳、规范化业务分类。

### 使用方法

```bash
# 预览模式（不实际修改，仅查看影响）
node clean-database.js --dry-run

# 实际执行清洗
node clean-database.js
```

### 清洗内容

1. **标题清理**: 移除乱码字符（如 ``、异常拉丁字母）
2. **内容清理**: 清理正文中的编码问题
3. **时间戳修复**: 将 null/0 的时间戳替换为当前时间
4. **分类规范化**: 统一繁简中文分类名称

### 输出示例

```
=== Alpha Radar 数据库清洗脚本 ===

数据库路径：C:\Users\lenovo\alpha-radar\alpha_radar.db
运行模式：🔧 实际执行

📊 分析数据库...

总记录数：1380

🔍 扫描需要清洗的数据...

📋 清洗报告:

┌─────────────────────────────────────┐
│ 总记录数：1380 │
│ 清理标题：23 │
│ 清理内容：15 │
│ 修复时间戳：8 │
│ 规范化分类：12 │
│ 错误数：0 │
└─────────────────────────────────────┘

✅ 验证清洗结果...

剩余乱码标题：0
无效时间戳：0

✨ 清洗脚本执行完毕！
```

---

## 2. Supabase RPC 函数

### 功能说明
在 Supabase PostgreSQL 中创建服务端统计函数，提升查询性能。

### 部署步骤

#### 方法一：Supabase Dashboard

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择你的项目
3. 进入 **SQL Editor**
4. 复制 `supabase-rpc-functions.sql` 全部内容
5. 点击 **Run** 执行

#### 方法二：psql 命令行

```bash
# 获取数据库连接字符串
# Supabase Dashboard -> Settings -> Database -> Connection string

psql postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres \
  -f supabase-rpc-functions.sql
```

### 验证安装

```sql
-- 检查函数是否创建成功
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE 'get_%';

-- 测试函数
SELECT * FROM get_category_stats();
SELECT * FROM get_source_stats();
SELECT * FROM get_daily_stats(7);
```

### 可用函数列表

| 函数名 | 说明 | 参数 |
|--------|------|------|
| `get_category_stats(since_ts)` | 按业务分类统计 | 起始时间戳（毫秒） |
| `get_source_stats()` | 按数据源统计 | 无 |
| `get_daily_stats(days)` | 按日期统计趋势 | 天数 |
| `get_alpha_score_distribution()` | Alpha 分数分布 | 无 |
| `cleanup_duplicate_news()` | 删除重复记录 | 无 |
| `archive_old_news(days)` | 归档旧数据 | 保留天数 |
| `get_database_health()` | 数据库健康报告 | 无 |

---

## 3. Redis 缓存集成

### 功能说明
为高频查询提供 Redis 缓存层，减少数据库压力。

### 安装依赖

```bash
npm install ioredis
```

### 配置环境变量

在 `.env` 文件中添加：

```bash
# Redis 配置
USE_REDIS=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password  # 可选
REDIS_DB=0
REDIS_PREFIX=alpha-radar:
```

### 使用示例

#### 在代码中使用

```javascript
const cache = require('./lib/redis-cache');

// 简单缓存
await cache.set('news:total', 1380, 300); // 缓存 5 分钟
const total = await cache.get('news:total');

// 带获取函数的缓存（防止击穿）
const stats = await cache.getOrSet('db:stats', async () => {
  return await db.getStats();
}, 600); // 缓存 10 分钟

// 批量删除
await cache.delPattern('news:*');

// 获取统计
const stats = await cache.getStats();
console.log(`命中率：${stats.hitRate}`);
```

#### 集成到 db.js

在 `db.js` 的 `getStats()` 函数中添加缓存：

```javascript
const cache = require('./lib/redis-cache');

async function getStats(since = 0) {
  // 尝试从缓存获取
  const cacheKey = `stats:${since || 'all'}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;
  
  // 从数据库查询
  const result = { /* ... */ };
  
  // 存入缓存
  await cache.set(cacheKey, result, 300);
  
  return result;
}
```

### 监控命令

```bash
# 使用 redis-cli 监控
redis-cli INFO stats
redis-cli MONITOR  # 实时查看所有命令（谨慎使用）
```

---

## 4. 监控面板

### 功能说明
提供可视化的系统监控界面，实时显示爬虫、AI、存储状态。

### 访问方式

启动服务器后，访问：

```
http://localhost:3001/monitoring.html
```

### 主要功能

1. **实时统计卡片**
   - 总新闻数
   - 重要新闻数量
   - 活跃数据源
   - AI 调用次数

2. **可视化图表**
   - 7 日新闻趋势图
   - 数据源分布图

3. **系统状态**
   - AI 提供商状态
   - 推送渠道状态
   - 存储使用情况

4. **爬虫健康表格**
   - 各数据源成功率
   - 最后更新时间
   - 失败次数统计

### 自动刷新

- 每 30 秒自动刷新数据
- 手动点击"刷新"按钮立即更新
- 服务器状态指示灯实时反馈

### 自定义样式

编辑 `public/monitoring.html` 中的 CSS 变量：

```css
:root {
  --bg-primary: #0f172a;      /* 背景色 */
  --accent: #3b82f6;          /* 主色调 */
  --success: #10b981;         /* 成功色 */
  --warning: #f59e0b;         /* 警告色 */
  --danger: #ef4444;          /* 危险色 */
}
```

---

## 5. 使用示例

### 完整工作流程

#### 步骤 1: 数据清洗

```bash
# 先预览
node clean-database.js --dry-run

# 执行清洗
node clean-database.js
```

#### 步骤 2: 部署 Supabase 函数

```bash
# 在 Supabase Dashboard 执行 SQL
# 见上文 "部署步骤"
```

#### 步骤 3: 启用 Redis 缓存

```bash
# 安装 Redis（Windows）
# 下载：https://github.com/microsoftarchive/redis/releases

# 启动 Redis
redis-server

# 配置 .env
echo "USE_REDIS=true" >> .env

# 重启应用
node server.js
```

#### 步骤 4: 访问监控面板

```bash
# 启动服务器
node server.js

# 浏览器访问
http://localhost:3001/monitoring.html
```

### 日常维护命令

```bash
# 查看数据库大小
du -h alpha_radar.db  # Linux/Mac
dir alpha_radar.db    # Windows

# 清理旧数据（通过 Supabase 函数）
# 在 SQL Editor 执行：
SELECT archive_old_news(90);  # 归档 90 天前数据

# 删除重复记录
SELECT cleanup_duplicate_news();

# 查看健康状态
SELECT get_database_health();
```

---

## 📝 注意事项

### 数据清洗

- ⚠️ **务必先备份数据库**
- ✅ 使用 `--dry-run` 预览效果
- ✅ 在低峰期执行

```bash
# 备份数据库
cp alpha_radar.db alpha_radar.backup.db
```

### Supabase RPC

- 🔑 确保有执行权限
- 📊 RPC 函数是 STABLE/VOLATILE 的，注意事务使用
- 💰 注意函数调用成本（免费额度内）

### Redis 缓存

- ⏰ 设置合理的 TTL（建议 5-15 分钟）
- 🔄 关键数据更新时记得清除缓存
- 📈 监控内存使用量

### 监控面板

- 🔒 生产环境建议添加认证
- 📱 支持移动端响应式布局
- 🎨 可根据品牌色自定义主题

---

## 🆘 故障排查

### 清洗脚本报错

```bash
# 检查 Node.js 版本
node -v  # 需要 >= 14

# 检查依赖
npm install better-sqlite3
```

### Supabase 函数不可用

```sql
-- 检查错误日志
SELECT * FROM pg_log WHERE query LIKE '%get_%';

-- 重新创建函数
DROP FUNCTION IF EXISTS get_category_stats(bigint);
-- 然后重新执行 SQL 脚本
```

### Redis 连接失败

```bash
# 检查 Redis 是否运行
redis-cli ping  # 应返回 PONG

# 检查端口
netstat -an | grep 6379

# 查看 Redis 日志
tail -f /var/log/redis/redis.log
```

---

## 📞 技术支持

如有问题，请：

1. 检查本文档是否覆盖
2. 查看项目 README.md
3. 搜索 GitHub Issues
4. 联系开发团队

---

**最后更新**: 2026-03-17  
**版本**: v2.1.0
