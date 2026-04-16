'use strict';
/**
 * run_send_weekly_email.js — 人工周报邮件发送
 *
 * 从环境变量读取标题/日期/结论，读取 weekly/ 文件夹中的图片，
 * 发送 HTML 邮件给领导层（图片内嵌正文，有问候语和落款）。
 *
 * 发送完成后自动清理 weekly/ 文件夹中的图片。
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { sendManualWeeklyEmail } = require('./email-report');

const subject   = (process.env.EMAIL_SUBJECT   || '').trim();
const summary   = (process.env.EMAIL_SUMMARY   || '').trim();
const dateRange = (process.env.EMAIL_DATE_RANGE || '').trim();

if (!subject || !summary) {
  console.error('[WeeklyEmail] 邮件标题和结论为必填项。');
  process.exit(1);
}

const WEEKLY_DIR = path.join(__dirname, 'weekly');

// 大小写不敏感地在 weekly/ 中查找文件
function findFile(...names) {
  if (!fs.existsSync(WEEKLY_DIR)) return null;
  const files = fs.readdirSync(WEEKLY_DIR);
  const lower = names.map(n => n.toLowerCase());
  const found = files.find(f => lower.includes(f.toLowerCase()));
  return found ? path.join(WEEKLY_DIR, found) : null;
}

// 检查文件是否是新上传的（48小时内），防止旧文件被误发
function checkFileIsFresh(filePath, maxAgeHours = 48) {
  if (!filePath) return true;
  const stat     = fs.statSync(filePath);
  const ageHours = (Date.now() - stat.mtimeMs) / 3600000;
  if (ageHours > maxAgeHours) {
    const modTime = stat.mtime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    console.error(`[WeeklyEmail] ❌ ${path.basename(filePath)} 超过 ${maxAgeHours} 小时未更新（上次修改: ${modTime}），疑似上次发送失败的残留文件。`);
    console.error('[WeeklyEmail] 请重新上传本周文件后再触发。');
    return false;
  }
  console.log(`[WeeklyEmail] ✓ ${path.basename(filePath)} 上传时间正常（${ageHours.toFixed(1)} 小时前）`);
  return true;
}

(async () => {
  const imagePath = findFile('image.png', 'image.jpg', 'image.jpeg');

  console.log(`[WeeklyEmail] 标题: ${subject}`);
  console.log(`[WeeklyEmail] 日期: ${dateRange || '（未填写，使用标题）'}`);
  console.log(`[WeeklyEmail] 图片: ${imagePath ? `✓ ${path.basename(imagePath)}` : '✗ 未找到（将发送无图版本）'}`);

  if (!checkFileIsFresh(imagePath)) process.exit(1);

  const ok = await sendManualWeeklyEmail(
    subject,
    summary,
    dateRange || subject,
    imagePath,
  );

  if (!ok) process.exit(1);

  // 发送成功后清理图片
  if (imagePath && fs.existsSync(imagePath)) {
    fs.unlinkSync(imagePath);
    console.log(`[WeeklyEmail] 已清理: ${path.basename(imagePath)}`);
  }

  console.log('[WeeklyEmail] 完成。');
})();
