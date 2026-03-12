# Alpha-Radar v1.4.0 部署清单

## 🚀 部署状态

✅ **代码已推送到 GitHub**: https://github.com/Beltran12138/industry-feeds  
✅ **Vercel 自动部署成功**: https://alpha-radar-l3n7fpsqs-beltran12138s-projects.vercel.app  
✅ **所有 API 端点正常工作**  
✅ **系统监控脚本已创建**  

## 📊 当前系统状态

```
✅ Health: ok
⏱️  Uptime: 0h 2m
⚠️  Database: 0 items (0 important)  ← Vercel 无状态环境
⚠️  AI: DeepSeek (Fallbacks: 0)     ← 需配置环境变量
⚠️  Push: 0 channels               ← 需配置环境变量
```

## 🛠️ 待办事项（生产环境配置）

### 1. 配置 Vercel 环境变量

登录 [Vercel Dashboard](https://vercel.com/dashboard) → 选择项目 → Settings → Environment Variables

必需配置：
```bash
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx  # AI 服务
WECOM_WEBHOOK_URL=https://qyapi.weixin.qq.com/...  # 企业微信推送
```

推荐配置（提高可用性）：
```bash
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxx  # AI 备用提供商
OPENAI_API_KEY=sk-proj-xxxxxxxx       # AI 备用提供商
```

可选配置：
```bash
DINGTALK_WEBHOOK_URL=...              # 钉钉推送
SLACK_WEBHOOK_URL=...                 # Slack 推送
TELEGRAM_BOT_TOKEN=...                # Telegram 推送
SMTP_HOST=smtp.gmail.com              # 邮件推送
```

### 2. 配置 GitHub Actions Secrets

如果使用 GitHub Actions 部署：
1. 进入 GitHub 仓库 Settings → Secrets and variables → Actions
2. 添加以下 secrets：
   - `DEEPSEEK_API_KEY`
   - `WECOM_WEBHOOK_URL`
   - 其他可选的 API Keys

### 3. 数据持久化方案（可选）

由于 Vercel 是无状态环境，数据不会持久化。可选方案：

**方案 A: 使用 Supabase（推荐）**
```bash
USE_SUPABASE=true
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=sb_publishable_xxxxx
```

**方案 B: 使用 GitHub Actions + SQLite**
- 配置 GitHub Actions 定时任务
- 数据存储在 GitHub Actions 环境中

## 🔍 监控命令

### 单次检查
```bash
node monitor.js
```

### 持续监控（每30秒）
```bash
node monitor.js --watch
```

### 指定监控地址
```bash
node monitor.js --url https://your-custom-domain.com
```

## 🧪 功能测试清单

- [x] 健康检查 API (`/api/health`)
- [x] AI 状态 API (`/api/ai-status`)
- [x] 推送状态 API (`/api/push-status`)
- [x] Twitter 状态 API (`/api/twitter-status`)
- [x] 新闻查询 API (`/api/news`)
- [ ] 数据抓取功能（需配置 API Keys 后测试）
- [ ] AI 分类功能（需配置 DeepSeek Key 后测试）
- [ ] 推送功能（需配置 Webhook 后测试）

## 📈 性能指标（待收集）

配置完成后应监控的关键指标：
- API 响应时间 < 1000ms
- 数据抓取成功率 > 95%
- AI 分类准确率 > 90%
- 推送送达率 > 99%
- 系统可用性 > 99.9%

## 🆘 故障排除

### 常见问题

1. **AI 服务不可用**
   - 检查 `DEEPSEEK_API_KEY` 是否正确配置
   - 查看 `/api/ai-status` 确认提供商状态

2. **推送失败**
   - 检查 Webhook URL 是否有效
   - 确认网络可达性
   - 查看 `/api/push-status` 确认渠道配置

3. **数据为空**
   - Vercel 环境是无状态的，这是正常的
   - 如需持久化，请配置 Supabase 或使用 GitHub Actions

4. **前端无法加载**
   - 检查静态资源是否正确部署
   - 确认 `public/index.html` 是否存在

### 日志查看

```bash
# 查看监控日志
cat monitor.log

# 查看 Vercel 部署日志
vercel logs https://alpha-radar-l3n7fpsqs-beltran12138s-projects.vercel.app
```

## 🔄 后续维护

### 定期任务
- [ ] 每周检查系统健康状态
- [ ] 每月审查 API 使用量和费用
- [ ] 每季度评估和优化数据源

### 升级步骤
1. 在本地分支开发新功能
2. 测试通过后推送到 GitHub
3. Vercel 会自动部署
4. 运行 `node monitor.js` 确认部署成功

---
*最后更新: 2026-03-13*
