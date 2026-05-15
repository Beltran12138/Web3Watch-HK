'use strict';
const fs   = require('fs');
const path = require('path');
const { buildManualEmailHtml } = require('./email-report');

const summary = `**本周核心观察：**

香港 Web3 监管窗口持续开放，SFC 稳定币牌照草案进入公众咨询阶段，预计 Q3 落地。

HashKey 与 Google Cloud 合作 RWA 基础设施，传统大厂背书信号明显，竞争格局或将加速重塑。

**建议关注：** 稳定币 B 端结算场景（Omnibus 模式）仍是最快落地切入口，建议提前布局合规通道。`;

// base64 logo for browser preview (email uses CID)
const logoPath = path.join(__dirname, 'assets', 'logo.jpg');
const logoSrc  = fs.existsSync(logoPath)
  ? `data:image/jpeg;base64,${fs.readFileSync(logoPath).toString('base64')}`
  : null;

const html = buildManualEmailHtml(summary, [], '0428 ~ 0504', logoSrc);

const out = path.join(__dirname, 'email-preview.html');
fs.writeFileSync(out, html, 'utf8');
console.log('Preview saved to: email-preview.html');
