@echo off
REM setup-windows.bat - Alpha-Radar Windows 一键安装脚本
REM 30 秒快速启动！

echo.
echo ============================================
echo    Alpha-Radar 安装向导 (Windows)
echo ============================================
echo.

REM 检查 Node.js
echo [1/5] 检查 Node.js 安装...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 未检测到 Node.js，请先安装 Node.js 20+
    echo 下载地址：https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js 已安装

REM 安装依赖
echo.
echo [2/5] 安装项目依赖...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] 依赖安装失败
    pause
    exit /b 1
)
echo [OK] 依赖安装完成

REM 安装 MCP Server 依赖（可选）
echo.
echo [3/5] 安装 MCP Server 依赖（可选功能）...
if exist "mcp-server" (
    cd mcp-server
    call npm install
    cd ..
    echo [OK] MCP Server 依赖安装完成
) else (
    echo [SKIP] mcp-server 目录不存在
)

REM 检查环境变量配置
echo.
echo [4/5] 检查环境变量配置...
if not exist ".env" (
    echo 创建 .env 配置文件...
    copy .env.example .env >nul
    echo [OK] .env 已创建，请编辑此文件填入 API Key
) else (
    echo [OK] .env 已存在
)

REM 初始化数据库
echo.
echo [5/5] 初始化数据库...
node -e "const {db} = require('./db'); console.log('[OK] SQLite 数据库就绪')"
if %errorlevel% neq 0 (
    echo [WARN] 数据库初始化失败，将在首次运行时自动创建
)

REM 完成
echo.
echo ============================================
echo    安装完成！
echo ============================================
echo.
echo 下一步:
echo 1. 编辑 .env 文件，填入必要的 API Key
echo    - DEEPSEEK_API_KEY（必需）
echo    - WECOM_WEBHOOK_URL（推送通知）
echo    - 其他可选配置见 .env.example
echo.
echo 2. 启动服务:
echo    npm start
echo.
echo 3. 访问前端:
echo    http://localhost:3001
echo.
echo 4. （可选）配置 MCP Server:
echo    参考 mcp-server/README.md
echo.
pause
