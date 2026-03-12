#!/usr/bin/env node
/**
 * monitor.js - Alpha-Radar 系统监控脚本
 *
 * 用法:
 *   node monitor.js                    # 单次检查
 *   node monitor.js --watch            # 持续监控 (每30秒)
 *   node monitor.js --url <URL>        # 指定监控地址
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  // 默认监控地址 (Vercel 部署)
  DEFAULT_URL: 'https://alpha-radar-l3n7fpsqs-beltran12138s-projects.vercel.app',
  // 检查间隔 (毫秒)
  INTERVAL: 30000,
  // 超时时间 (毫秒)
  TIMEOUT: 10000,
  // 日志文件
  LOG_FILE: path.join(__dirname, 'monitor.log'),
};

// 解析命令行参数
const args = process.argv.slice(2);
const options = {
  watch: args.includes('--watch'),
  url: args.includes('--url') ? args[args.indexOf('--url') + 1] : CONFIG.DEFAULT_URL,
};

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  reset: '\x1b[0m',
};

function log(message, color = 'reset') {
  const timestamp = new Date().toISOString();
  const coloredMsg = `${colors[color]}[${timestamp}] ${message}${colors.reset}`;
  console.log(coloredMsg);
  
  // 写入日志文件
  fs.appendFileSync(CONFIG.LOG_FILE, `[${timestamp}] ${message}\n`);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function checkHealth(url) {
  try {
    const res = await axios.get(`${url}/api/health`, {
      timeout: CONFIG.TIMEOUT,
    });

    const data = res.data;
    
    // 基本状态
    const status = data.status === 'ok' ? '✅' : '❌';
    log(`${status} Health: ${data.status}`, data.status === 'ok' ? 'green' : 'red');
    
    // 运行时间
    const uptime = `${Math.floor(data.uptime / 3600)}h ${Math.floor((data.uptime % 3600) / 60)}m`;
    log(`⏱️  Uptime: ${uptime}`, 'blue');
    
    // 数据库状态
    const dbStatus = data.db.total > 0 ? '✅' : '⚠️ ';
    log(`${dbStatus} Database: ${data.db.total} items (${data.db.important} important)`, 
        data.db.total > 0 ? 'green' : 'yellow');
    
    // AI 状态
    if (data.ai) {
      const aiStatus = data.ai.providers.some(p => p.enabled) ? '✅' : '⚠️ ';
      const activeProvider = data.ai.providers.find(p => p.isActive)?.name || 'None';
      log(`${aiStatus} AI: ${activeProvider} (Fallbacks: ${data.ai.fallbackCount})`,
          data.ai.providers.some(p => p.enabled) ? 'green' : 'yellow');
    }
    
    // 推送渠道
    if (data.push) {
      const pushStatus = data.push.channels.length > 0 ? '✅' : '⚠️ ';
      log(`${pushStatus} Push: ${data.push.channels.length} channels`,
          data.push.channels.length > 0 ? 'green' : 'yellow');
    }
    
    // 存储状态
    if (data.storage) {
      log(`💾 Storage: ${data.storage.fileSizeMB} MB`, 'blue');
    }
    
    return true;
  } catch (err) {
    log(`❌ Health check failed: ${err.message}`, 'red');
    return false;
  }
}

async function checkAPIs(url) {
  const apis = [
    { name: 'AI Status', path: '/api/ai-status' },
    { name: 'Push Status', path: '/api/push-status' },
    { name: 'Twitter Status', path: '/api/twitter-status' },
    { name: 'News (Important)', path: '/api/news?source=Important&limit=1' },
  ];

  log('\n--- API Checks ---', 'gray');
  
  for (const api of apis) {
    try {
      const res = await axios.get(`${url}${api.path}`, {
        timeout: CONFIG.TIMEOUT,
      });
      
      const success = res.data?.success ?? (res.status === 200);
      log(`✅ ${api.name}: OK`, 'green');
    } catch (err) {
      log(`❌ ${api.name}: ${err.message}`, 'red');
    }
  }
}

async function runCheck(url) {
  log(`\n🔍 Monitoring Alpha-Radar at ${url}`, 'blue');
  log('=' .repeat(50), 'gray');
  
  const healthOk = await checkHealth(url);
  await checkAPIs(url);
  
  log('=' .repeat(50), 'gray');
  return healthOk;
}

async function main() {
  if (options.watch) {
    log(`🚀 Starting continuous monitoring (interval: ${CONFIG.INTERVAL/1000}s)`, 'blue');
    log(`Press Ctrl+C to stop\n`, 'gray');
    
    // 立即执行一次
    await runCheck(options.url);
    
    // 设置定时器
    const timer = setInterval(async () => {
      await runCheck(options.url);
    }, CONFIG.INTERVAL);
    
    // 优雅退出
    process.on('SIGINT', () => {
      log('\n🛑 Stopping monitor...', 'yellow');
      clearInterval(timer);
      process.exit(0);
    });
    
  } else {
    // 单次检查
    const ok = await runCheck(options.url);
    process.exit(ok ? 0 : 1);
  }
}

// 执行
main().catch(err => {
  log(`💥 Fatal error: ${err.message}`, 'red');
  process.exit(1);
});
