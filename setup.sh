#!/bin/bash
# setup.sh - Alpha-Radar macOS/Linux 一键安装脚本
# 30 秒快速启动！

set -e

echo ""
echo "============================================"
echo "   Alpha-Radar 安装向导 (macOS/Linux)"
echo "============================================"
echo ""

# 检查 Node.js
echo "[1/5] 检查 Node.js 安装..."
if ! command -v node &> /dev/null; then
    echo "[ERROR] 未检测到 Node.js，请先安装 Node.js 20+"
    echo "macOS: brew install node@20"
    echo "Linux: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
    exit 1
fi
NODE_VERSION=$(node --version)
echo "[OK] Node.js 已安装：$NODE_VERSION"

# 检查 npm
echo "[2/5] 检查 npm..."
if ! command -v npm &> /dev/null; then
    echo "[ERROR] 未检测到 npm"
    exit 1
fi
NPM_VERSION=$(npm --version)
echo "[OK] npm 已安装：$NPM_VERSION"

# 安装依赖
echo ""
echo "[3/5] 安装项目依赖..."
npm install
echo "[OK] 依赖安装完成"

# 安装 MCP Server 依赖（可选）
echo ""
echo "[4/5] 安装 MCP Server 依赖（可选功能）..."
if [ -d "mcp-server" ]; then
    cd mcp-server
    npm install
    cd ..
    echo "[OK] MCP Server 依赖安装完成"
else
    echo "[SKIP] mcp-server 目录不存在"
fi

# 检查环境变量配置
echo ""
echo "[5/5] 检查环境变量配置..."
if [ ! -f ".env" ]; then
    echo "创建 .env 配置文件..."
    cp .env.example .env
    echo "[OK] .env 已创建，请编辑此文件填入 API Key"
else
    echo "[OK] .env 已存在"
fi

# 初始化数据库
echo ""
echo "初始化数据库..."
node -e "const {db} = require('./db'); console.log('[OK] SQLite 数据库就绪')" || echo "[WARN] 数据库初始化失败，将在首次运行时自动创建"

# 完成
echo ""
echo "============================================"
echo "   安装完成！"
echo "============================================"
echo ""
echo "下一步:"
echo "1. 编辑 .env 文件，填入必要的 API Key"
echo "   - DEEPSEEK_API_KEY（必需）"
echo "   - WECOM_WEBHOOK_URL（推送通知）"
echo "   - 其他可选配置见 .env.example"
echo ""
echo "2. 启动服务:"
echo "   npm start"
echo ""
echo "3. 访问前端:"
echo "   http://localhost:3001"
echo ""
echo "4. （可选）配置 MCP Server:"
echo "   参考 mcp-server/README.md"
echo ""
echo "============================================"
