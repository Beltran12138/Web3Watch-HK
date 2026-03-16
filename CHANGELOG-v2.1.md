# Alpha Radar v2.1.0 更新日志

## 概述

本次更新聚焦于 **代码质量提升**、**安全加固** 和 **工程化改进**，基于深度代码审计和 OpenClaw 最佳实践参考。

---

## 安全加固

### 1. CSP 策略启用 (security.js)

**问题**: 完全禁用 CSP 使前端容易受 XSS 攻击。

**解决方案**:
- 启用 Content Security Policy
- 配置允许的 CDN 资源（unpkg.com、jsdelivr.net、statics.moonshot.cn）
- 限制脚本、样式、图片、字体的加载来源

### 2. API Key 传递方式修复 (server.js)

**问题**: API Key 可通过 URL 参数传递，存在泄露风险。

**解决方案**:
- 移除 `req.query.apiKey` 支持
- 仅允许通过 `X-API-Key` Header 传递
- URL 参数不再出现在浏览器历史、服务器日志中

### 3. CORS 配置统一 (security.js)

**问题**: server.js 和 security.js 存在重复且冲突的 CORS 配置。

**解决方案**:
- 统一在 security.js 中处理 CORS
- 移除 server.js 中的重复配置
- 生产环境未配置 CORS_ORIGIN 时只允许同源

### 4. 全局错误处理 (server.js)

**问题**: 未捕获的异常可能导致信息泄露或进程崩溃。

**解决方案**:
- 添加 Express 全局错误处理中间件
- 生产环境隐藏详细错误信息
- 开发环境保留详细堆栈

---

## 性能优化

### 1. 限流策略分离 (security.js)

**问题**: 全局限流 100 req/15min 对前端轮询可能过严。

**解决方案**:
- 读操作限流：1000 req/15min（GET/HEAD 请求）
- 写操作限流：10 req/min（POST/PUT/DELETE）
- 保护关键端点：refresh、daily-report、weekly-report、cleanup、sync/save、push-test

### 2. 请求体大小限制 (server.js)

**新增**:
- JSON 请求体限制 10MB，防止大请求攻击

---

## 工程化改进

### 1. 版本号统一

**修复**:
- package.json: 2.0.0 → 2.1.0
- README.md: 1.4.0 → 2.1.0

### 2. 代码质量工具链

**新增**:
- ESLint 配置（检测潜在 bug、代码风格）
- Prettier 配置（统一代码格式化）
- CI workflow（PR 时自动运行测试和 lint）

### 3. 结构化日志 (lib/logger.js)

**新增**:
- 基于 pino 的结构化日志系统
- 支持日志分级（debug/info/warn/error）
- JSON 格式便于日志分析系统处理

### 4. 模块化路由 (routes/)

**重构**:
- 拆分 server.js 为独立路由模块
- routes/news.js - 新闻相关 API
- routes/admin.js - 管理接口
- routes/monitoring.js - 监控接口
- routes/sync.js - 同步接口

### 5. Scraper 注册表 (lib/scraper-registry.js)

**新增**:
- 插件化 scraper 注册机制
- 支持按 tier 获取 scraper
- 便于动态添加/禁用数据源

### 6. 熔断器模式 (lib/circuit-breaker.js)

**新增**:
- 为每个数据源实现熔断器
- 连续失败 N 次后自动暂停
- 避免资源浪费和错误日志风暴

---

## API 变更

### 行为变更

| 端点 | 变更 | 说明 |
|------|------|------|
| 所有写操作 | API Key 仅支持 Header | 不再支持 `?apiKey=xxx` 参数 |
| /api/* | CSP 生效 | 浏览器将执行 CSP 策略 |
| GET /api/* | 限流放宽 | 1000 req/15min（原 100） |
| POST/PUT/DELETE /api/* | 限流严格 | 10 req/min |

### 新增端点

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/health/detailed` | 详细健康检查（含各子系统状态） |

---

## 迁移指南

### 从 v2.0 升级到 v2.1

1. **更新依赖**
   ```bash
   npm install
   ```

2. **更新 API 调用方式**
   - 如果之前通过 URL 参数传递 API Key，改为 Header 方式：
   ```bash
   # 旧方式（不再支持）
   curl "https://api.example.com/api/refresh?apiKey=xxx"

   # 新方式
   curl -H "X-API-Key: xxx" https://api.example.com/api/refresh
   ```

3. **配置 CORS（生产环境）**
   ```bash
   # .env
   CORS_ORIGIN=https://your-domain.com
   ```

4. **运行测试**
   ```bash
   npm test
   npm run lint
   ```

5. **重启服务**
   ```bash
   npm start
   ```

---

## 文件变更

### 新增文件
```
lib/
  ├── logger.js           # 结构化日志
  ├── scraper-registry.js # Scraper 注册表
  ├── circuit-breaker.js  # 熔断器模式
  └── error-handler.js    # 统一错误处理

routes/
  ├── index.js            # 路由聚合
  ├── news.js             # 新闻 API
  ├── admin.js            # 管理 API
  ├── monitoring.js       # 监控 API
  └── sync.js             # 同步 API

.eslintrc.js              # ESLint 配置
.prettierrc               # Prettier 配置
.github/workflows/ci.yml  # CI 配置
AGENTS.md                 # AI 工具配置
```

### 修改文件
```
security.js               # CSP 策略、CORS 统一
server.js                 # 移除内联 require、全局错误处理
package.json              # 版本号、新增依赖
README.md                 # 版本号
.gitignore                # 新增忽略规则
```

---

## 性能指标

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 安全头评分 | D | A |
| 代码规范检查 | 无 | ESLint + Prettier |
| 日志结构化 | 无 | pino JSON 格式 |
| 错误处理 | 分散 | 统一中间件 |
| 限流粒度 | 单一 | 读写分离 |

---

## 贡献者

- 代码审计与优化：Claude Code
- 参考设计：OpenClaw 项目

---

## 许可证

MIT © Alpha-Radar Team
