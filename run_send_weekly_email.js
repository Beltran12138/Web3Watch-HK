'use strict';
/**
 * run_send_weekly_email.js — 人工周报邮件发送
 *
 * 从环境变量读取标题和结论，读取 weekly/ 文件夹中的图片和 PDF，
 * 发送 HTML 邮件给领导层（图片内嵌正文，PDF 作为附件）。
 *
 * 发送完成后自动清理 weekly/ 文件夹中的图片和 PDF。
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { sendManualWeeklyEmail } = require('./email-report');

const subject = (process.env.EMAIL_SUBJECT || '').trim();
const summary = (process.env.EMAIL_SUMMARY || '').trim();

if (!subject || !summary) {
  console.error('[WeeklyEmail] 邮件标题和结论为必填项。');
  process.exit(1);
}

const WEEKLY_DIR = path.join(__dirname, 'weekly');

// 大小写不敏感地在 weekly/ 中查找文件（兼容 Report.pdf / report.pdf 等各种命名）
function findFile(...names) {
  if (!fs.existsSync(WEEKLY_DIR)) return null;
  const files = fs.readdirSync(WEEKLY_DIR);
  const lower = names.map(n => n.toLowerCase());
  const found = files.find(f => lower.includes(f.toLowerCase()));
  return found ? path.join(WEEKLY_DIR, found) : null;
}

// 检查文件是否是新上传的（48小时内），防止旧文件被误发
function checkFileIsFresh(filePath, maxAgeHours = 48) {
  if (!filePath) return true; // 文件不存在，跳过检查
  const stat = fs.statSync(filePath);
  const ageHours = (Date.now() - stat.mtimeMs) / 3600000;
  if (ageHours > maxAgeHours) {
    console.error(`[WeeklyEmail] ❌ 文件 ${path.basename(filePath)} 已超过 ${maxAgeHours} 小时（上次修改: ${stat.mtime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}），疑似上次发送失败残留的旧文件。`);
    console.error(`[WeeklyEmail] 请重新上传本周的文件后再触发。`);
    return false;
  }
  console.log(`[WeeklyEmail] ✓ ${path.basename(filePath)} 上传时间正常（${ageHours.toFixed(1)} 小时前）`);
  return true;
}

(async () => {
  const imagePath = findFile('image.png', 'image.jpg', 'image.jpeg');
  const pdfPath   = findFile('report.pdf');

  console.log(`[WeeklyEmail] 标题: ${subject}`);
  console.log(`[WeeklyEmail] 图片: ${imagePath ? `✓ ${path.basename(imagePath)}` : '✗ 未找到'}`);
  console.log(`[WeeklyEmail] PDF:  ${pdfPath   ? `✓ ${path.basename(pdfPath)}`   : '✗ 未找到'}`);

  // 校验文件新鲜度，防止旧文件被误发
  const imageOk = checkFileIsFresh(imagePath);
  const pdfOk   = checkFileIsFresh(pdfPath);
  if (!imageOk || !pdfOk) process.exit(1);

  const ok = await sendManualWeeklyEmail(subject, summary, imagePath, pdfPath);

  if (!ok) {
    process.exit(1);
  }

  // 发送成功后清理文件（保留 README.md）
  [imagePath, pdfPath].filter(Boolean).forEach(f => {
    fs.unlinkSync(f);
    console.log(`[WeeklyEmail] 已清理: ${path.basename(f)}`);
  });

  console.log('[WeeklyEmail] 完成。');
})();
