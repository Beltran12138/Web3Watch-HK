#!/usr/bin/env node
/**
 * configure.js - Alpha-Radar 配置向导
 * 
 * 交互式配置环境变量和 MCP Server
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ENV_FILE = path.join(__dirname, '.env');
const ENV_EXAMPLE = path.join(__dirname, '.env.example');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  console.log('\n============================================');
  console.log('   Alpha-Radar 配置向导');
  console.log('============================================\n');

  // 检查 .env 文件
  let envContent = '';
  if (fs.existsSync(ENV_FILE)) {
    envContent = fs.readFileSync(ENV_FILE, 'utf-8');
    console.log('✓ 发现现有 .env 文件\n');
  } else {
    console.log('创建新的 .env 文件...\n');
    if (fs.existsSync(ENV_EXAMPLE)) {
      envContent = fs.readFileSync(ENV_EXAMPLE, 'utf-8');
    }
  }

  // 解析现有配置
  const envVars = {};
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      envVars[match[1].trim()] = match[2].trim();
    }
  });

  // 配置 DeepSeek API
  console.log('--- AI 配置 ---');
  if (!envVars.DEEPSEEK_API_KEY || envVars.DEEPSEEK_API_KEY === 'sk-xxxxxxxxxxxxxxxxxxxxxxxx') {
    const apiKey = await question('DeepSeek API Key: ');
    if (apiKey) {
      envVars.DEEPSEEK_API_KEY = apiKey;
      console.log('✓ DeepSeek API Key 已设置\n');
    } else {
      console.log('⚠ 跳过（后续需手动配置）\n');
    }
  }

  // 配置推送渠道
  console.log('--- 推送渠道配置 ---');
  console.log('选择要配置的推送渠道（多个用逗号分隔）:');
  console.log('1. wecom     - 企业微信');
  console.log('2. dingtalk  - 钉钉');
  console.log('3. feishu    - 飞书');
  console.log('4. telegram  - Telegram');
  console.log('5. slack     - Slack');
  console.log('6. ntfy      - ntfy 手机推送');
  console.log('7. bark      - Bark iOS 推送');
  console.log('8. email     - Email');
  console.log('0. 跳过推送配置');
  
  const channels = await question('\n选择 [默认：全部]: ');
  
  if (channels !== '0') {
    const selected = channels ? channels.split(',').map(s => s.trim()) : ['all'];
    
    if (selected.includes('all') || selected.includes('1')) {
      if (!envVars.WECOM_WEBHOOK_URL) {
        const url = await question('企业微信 Webhook URL: ');
        if (url) envVars.WECOM_WEBHOOK_URL = url;
      }
    }
    
    if (selected.includes('all') || selected.includes('3')) {
      if (!envVars.FEISHU_WEBHOOK_URL) {
        const url = await question('飞书 Webhook URL: ');
        if (url) envVars.FEISHU_WEBHOOK_URL = url;
      }
    }
    
    if (selected.includes('all') || selected.includes('6')) {
      if (!envVars.NTFY_TOPIC) {
        const topic = await question('ntfy Topic 名称: ');
        if (topic) {
          envVars.NTFY_TOPIC = topic;
          envVars.NTFY_SERVER = 'https://ntfy.sh';
        }
      }
    }
    
    if (selected.includes('all') || selected.includes('7')) {
      if (!envVars.BARK_DEVICE_KEY) {
        const key = await question('Bark Device Key: ');
        if (key) {
          envVars.BARK_DEVICE_KEY = key;
          envVars.BARK_SERVER = 'https://api.day.app';
        }
      }
    }
    
    console.log('✓ 推送渠道配置完成\n');
  }

  // 服务配置
  console.log('--- 服务配置 ---');
  if (!envVars.PORT) {
    envVars.PORT = '3001';
  }
  if (!envVars.API_SECRET) {
    const secret = await question('API Secret (用于保护 API 端点，留空自动生成): ');
    envVars.API_SECRET = secret || `alpha-radar-${Math.random().toString(36).substring(2, 15)}`;
  }

  // 生成 .env 文件
  let output = '# Alpha Radar 环境变量配置\n';
  output += '# 由配置向导自动生成于 ' + new Date().toISOString() + '\n\n';
  
  // 必需配置
  output += '# =============================================================================\n';
  output += '# 必需配置\n';
  output += '# =============================================================================\n\n';
  
  if (envVars.DEEPSEEK_API_KEY) {
    output += `DEEPSEEK_API_KEY=${envVars.DEEPSEEK_API_KEY}\n\n`;
  }

  // 推送渠道
  output += '# =============================================================================\n';
  output += '# 推送渠道\n';
  output += '# =============================================================================\n\n';
  
  const pushChannels = ['WECOM_WEBHOOK_URL', 'DINGTALK_WEBHOOK_URL', 'DINGTALK_SECRET', 
                        'FEISHU_WEBHOOK_URL', 'FEISHU_SECRET', 'SLACK_WEBHOOK_URL',
                        'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'NTFY_TOPIC', 'NTFY_SERVER',
                        'BARK_DEVICE_KEY', 'BARK_SERVER'];
  
  pushChannels.forEach(key => {
    if (envVars[key]) {
      output += `${key}=${envVars[key]}\n`;
    }
  });
  output += '\n';

  // 服务配置
  output += '# =============================================================================\n';
  output += '# 服务配置\n';
  output += '# =============================================================================\n\n';
  output += `PORT=${envVars.PORT || '3001'}\n`;
  output += `API_SECRET=${envVars.API_SECRET}\n`;
  output += `CORS_ORIGIN=http://localhost:${envVars.PORT || '3001'}\n\n`;

  // 写入文件
  fs.writeFileSync(ENV_FILE, output);
  console.log(`\n✓ .env 文件已保存：${ENV_FILE}\n`);

  // MCP Server 配置
  console.log('--- MCP Server 配置 ---');
  const setupMcp = await question('是否配置 Claude Desktop 的 MCP Server? (y/n) [默认：y]: ');
  
  if (setupMcp.toLowerCase() !== 'n') {
    await setupClaudeDesktop(envVars);
  }

  console.log('\n============================================');
  console.log('   配置完成！');
  console.log('============================================\n');
  
  console.log('下一步:\n');
  console.log('1. 启动服务:');
  console.log('   npm start\n');
  
  console.log('2. 访问前端:');
  console.log(`   http://localhost:${envVars.PORT || '3001'}\n`);
  
  console.log('3. 测试 MCP Server (如果已配置):');
  console.log('   在 Claude Desktop 中询问："获取最新的香港合规新闻"\n');
  
  console.log('4. 查看完整文档:');
  console.log('   OPTIMIZATION_COMPLETE.md\n');

  rl.close();
}

async function setupClaudeDesktop(envVars) {
  const homeDir = process.platform === 'win32' 
    ? process.env.APPDATA 
    : process.env.HOME + '/Library/Application Support';
  
  const configPath = path.join(homeDir, 'Claude', 'claude_desktop_config.json');
  
  const mcpConfig = {
    mcpServers: {
      'alpha-radar': {
        command: 'node',
        args: ['server.js'],
        cwd: path.join(__dirname, 'mcp-server'),
        env: {
          API_BASE_URL: `http://localhost:${envVars.PORT || '3001'}/api`,
          API_SECRET: envVars.API_SECRET || ''
        }
      }
    }
  };

  try {
    // 确保目录存在
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 写入配置
    fs.writeFileSync(configPath, JSON.stringify(mcpConfig, null, 2));
    console.log(`✓ MCP Server 已配置到 Claude Desktop`);
    console.log(`  配置文件：${configPath}\n`);
    console.log('⚠ 请重启 Claude Desktop 以加载 MCP Server\n');
  } catch (err) {
    console.log(`⚠ 无法自动配置 Claude Desktop: ${err.message}`);
    console.log('\n手动配置方法:');
    console.log('编辑 claude_desktop_config.json 添加以下内容:\n');
    console.log(JSON.stringify(mcpConfig, null, 2));
    console.log('');
  }
}

main().catch(console.error);
