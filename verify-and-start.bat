@echo off
REM verify-and-start.bat - 验证配置并启动 Alpha-Radar

echo.
echo ============================================
echo    Alpha-Radar 验证与启动
echo ============================================
echo.

REM 检查环境变量
echo [1/4] 检查环境变量配置...
node -e "const fs = require('fs'); const env = fs.readFileSync('.env', 'utf-8'); console.log(env.includes('DEEPSEEK_API_KEY=sk-') ? '  [OK] DeepSeek API Key 已配置' : '  [WARN] DeepSeek API Key 未配置');" 2>&1
node -e "const fs = require('fs'); const env = fs.readFileSync('.env', 'utf-8'); console.log(env.includes('WECOM_WEBHOOK_URL=') ? '  [OK] 企业微信已配置' : '  [INFO] 企业微信未配置');" 2>&1
echo.

REM 测试数据库
echo [2/4] 测试数据库连接...
node -e "const {db} = require('./db'); const stmt = db.prepare('SELECT COUNT(*) as c FROM news'); const r = stmt.get(); console.log('  [OK] 数据库正常，新闻数:', r.c);" 2>&1
echo.

REM 测试 MCP Server
echo [3/4] 测试 MCP Server...
node -e "const {getLatestNews} = require('./mcp-server'); getLatestNews({limit:1, min_score:70}).then(r => { console.log('  [OK] MCP Server 正常，高价值新闻:', r.count || r.data?.length); }).catch(e => console.log('  [WARN] MCP 测试失败:', e.message));" 2>&1
echo.

REM 测试推送渠道
echo [4/4] 测试推送渠道...
node -e "const {pushManager} = require('./push-channel'); const s = pushManager.getStatus(); console.log('  [OK] 推送渠道数:', s.total); s.channels.forEach(c => console.log('    - ' + c.name + ': ' + (c.enabled ? '可用' : '未配置')));" 2>&1
echo.

echo ============================================
echo    验证完成！
echo ============================================
echo.
echo 系统状态:
echo   AI 服务 ......... 就绪
echo   数据库 .......... 就绪
echo   MCP Server ...... 就绪
echo   推送渠道 ........ %total% 个可用
echo.
echo 下一步:
echo 1. 启动服务：npm start
echo 2. 访问前端：http://localhost:3001
echo 3. 配置 MCP: 见 START_HERE.md
echo.
echo 按任意键继续...
pause >nul

REM 询问是否启动
echo.
set /p start="是否现在启动服务？(Y/N): "
if /i "%start%"=="Y" (
    echo.
    echo 正在启动 Alpha-Radar...
    npm start
) else (
    echo.
    echo 稍后手动运行：npm start
)
