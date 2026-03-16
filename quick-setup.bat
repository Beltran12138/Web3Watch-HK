@echo off
REM quick-setup.bat - 快速配置和启动 Alpha-Radar

echo.
echo ============================================
echo    Alpha-Radar 快速启动
echo ============================================
echo.

REM 检查 .env 文件
if not exist ".env" (
    echo 创建 .env 配置文件...
    copy .env.example .env
    echo.
    echo [提示] 请编辑 .env 文件填入必要的 API Key:
    echo   - DEEPSEEK_API_KEY
    echo   - WECOM_WEBHOOK_URL (可选)
    echo.
    pause
)

REM 安装 MCP Server 依赖
echo 安装 MCP Server 依赖...
cd mcp-server
call npm install --silent >nul 2>&1
cd ..
echo [OK] MCP Server 依赖安装完成
echo.

REM 测试 MCP Server
echo 测试 MCP Server...
node -e "const {getLatestNews} = require('./mcp-server'); getLatestNews({limit:1}).then(r => console.log('[OK] MCP Server 正常，数据库有', r.count || r.data?.length, '条记录')).catch(e => console.log('[WARN] MCP Server 测试失败:', e.message))"
echo.

REM 生成 MCP 配置说明
echo 生成 MCP Server 配置说明...
echo.
echo ============================================
echo    MCP Server 配置方法
echo ============================================
echo.
echo 1. 打开 Claude Desktop 配置文件:
echo    Windows: %%APPDATA%%\Claude\claude_desktop_config.json
echo    macOS:   ~/Library/Application Support/Claude/claude_desktop_config.json
echo.
echo 2. 添加以下配置:
echo {
echo   "mcpServers": {
echo     "alpha-radar": {
echo       "command": "node",
echo       "args": ["server.js"],
echo       "cwd": "%CD%\mcp-server",
echo       "env": {
echo         "API_BASE_URL": "http://localhost:3001/api",
echo         "API_SECRET": ""
echo       }
echo     }
echo   }
echo }
echo.
echo 3. 重启 Claude Desktop
echo.
echo ============================================
echo.
echo 下一步:
echo 1. 编辑 .env 文件，填入 API Key
echo 2. 运行：npm start
echo 3. 访问：http://localhost:3001
echo.
pause
