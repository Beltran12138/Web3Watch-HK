# Alpha-Radar 开发指南

感谢您对 Alpha-Radar 项目的兴趣！本指南将帮助您快速上手开发。

## 🏗️ 项目结构

```
alpha-radar/
├── scrapers/           # 爬虫模块
│   └── sources/       # 数据源实现
├── ai*.js             # AI 处理模块
├── db.js             # 数据库层
├── push-channel.js  # 推送渠道
├── server.js         # Express 服务
├── public/           # 前端静态文件
├── monitoring/       # 监控模块
└── tests/            # 测试文件
```

## 🚀 本地开发

### 前置要求

- Node.js >= 20
- npm 或 pnpm

### 安装依赖

```bash
npm install
```

### 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入必要的 API Key
```

### 启动开发服务器

```bash
# 方式一：使用 nodemon 热重载
npm run dev

# 方式二：直接运行
npm start
```

### 运行爬虫

```bash
# 全量抓取
npm run scrape

# 高频抓取（5分钟间隔）
npm run scrape:high

# 低频抓取（30分钟间隔）
npm run scrape:low
```

### 测试报告

```bash
# 日报 dry-run
npm run daily-report:dry

# 周报 dry-run
npm run weekly-report:dry
```

## 🧪 测试

```bash
# 运行所有测试
npm test

# 运行单元测试
npm run test:unit

# 监听模式（开发中）
npm run test:watch
```

## 📦 发布订阅包

项目使用 pnpm workspaces（准备迁移中）：

```bash
# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 运行 lint
pnpm lint
```

## 🔧 常用开发任务

### 添加新的数据源

1. 在 `scrapers/sources/` 下创建新的爬虫文件
2. 在 `scrapers/index.js` 的 `ALL_SCRAPERS` 中注册
3. 在 `config.js` 添加相关配置

### 添加新的推送渠道

1. 在 `push-channel.js` 中添加新渠道实现
2. 在 `config.js` 配置对应环境变量

### 添加 AI 模型支持

修改 `ai-provider.js` 中的提供商配置

## 📝 代码规范

- 使用 ESM 模块语法（`"type": "module"`）
- 遵循 ESLint 配置
- 提交前运行 `npm test`
- 使用Conventional Commits 提交规范

## 🐛 报告问题

1. 搜索现有 issues
2. 提供复现步骤
3. 包含相关日志
4. 说明环境信息

## 📄 许可证

MIT License
