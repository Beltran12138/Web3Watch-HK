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

(async () => {
  const imagePath = findFile('image.png', 'image.jpg', 'image.jpeg');
  const pdfPath   = findFile('report.pdf');

  console.log(`[WeeklyEmail] 标题: ${subject}`);
  console.log(`[WeeklyEmail] 图片: ${imagePath ? `✓ ${path.basename(imagePath)}` : '✗ 未找到'}`);
  console.log(`[WeeklyEmail] PDF:  ${pdfPath   ? `✓ ${path.basename(pdfPath)}`   : '✗ 未找到'}`);

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
