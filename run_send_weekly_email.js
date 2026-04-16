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

const IMAGE_PATH = path.join(__dirname, 'weekly', 'image.png');
const PDF_PATH   = path.join(__dirname, 'weekly', 'report.pdf');

(async () => {
  console.log(`[WeeklyEmail] 标题: ${subject}`);
  console.log(`[WeeklyEmail] 图片: ${fs.existsSync(IMAGE_PATH) ? '✓ 已找到' : '✗ 未找到'}`);
  console.log(`[WeeklyEmail] PDF:  ${fs.existsSync(PDF_PATH)   ? '✓ 已找到' : '✗ 未找到'}`);

  const ok = await sendManualWeeklyEmail(
    subject,
    summary,
    fs.existsSync(IMAGE_PATH) ? IMAGE_PATH : null,
    fs.existsSync(PDF_PATH)   ? PDF_PATH   : null,
  );

  if (!ok) {
    process.exit(1);
  }

  // 发送成功后清理文件（保留 README.md）
  [IMAGE_PATH, PDF_PATH].forEach(f => {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      console.log(`[WeeklyEmail] 已清理: ${path.basename(f)}`);
    }
  });

  console.log('[WeeklyEmail] 完成。');
})();
