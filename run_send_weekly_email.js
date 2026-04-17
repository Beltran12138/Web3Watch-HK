'use strict';
/**
 * run_send_weekly_email.js — 人工周报邮件发送
 *
 * 从环境变量读取标题/日期/结论，读取 weekly/ 文件夹中的图片（支持多张），
 * 发送 HTML 邮件给领导层（图片按文件名顺序内嵌正文，有问候语和落款）。
 *
 * 图片命名建议：01.png / 02.png / 03.png，或 image1.png / image2.png
 * 发送完成后自动清理 weekly/ 文件夹中的图片。
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { sendManualWeeklyEmail } = require('./email-report');

const subject   = (process.env.EMAIL_SUBJECT   || '').trim();
// 用 | 作为换行符，方便在单行输入框中输入多段文字
const summary   = (process.env.EMAIL_SUMMARY   || '').trim().replace(/\|/g, '\n');
const dateRange = (process.env.EMAIL_DATE_RANGE || '').trim();

if (!subject || !summary) {
  console.error('[WeeklyEmail] 邮件标题和结论为必填项。');
  process.exit(1);
}

const WEEKLY_DIR = path.join(__dirname, 'weekly');
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

// 扫描 weekly/ 中所有图片，按文件名字母顺序排序
function findAllImages() {
  if (!fs.existsSync(WEEKLY_DIR)) return [];
  return fs.readdirSync(WEEKLY_DIR)
    .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(f => path.join(WEEKLY_DIR, f));
}

// 检查文件是否是新上传的（48小时内），防止旧文件被误发
function checkFileIsFresh(filePath, maxAgeHours = 48) {
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
  const imagePaths = findAllImages();

  console.log(`[WeeklyEmail] 标题: ${subject}`);
  console.log(`[WeeklyEmail] 日期: ${dateRange || '（未填写，使用标题）'}`);
  if (imagePaths.length === 0) {
    console.log('[WeeklyEmail] 图片: ✗ 未找到（将发送无图版本）');
  } else {
    console.log(`[WeeklyEmail] 图片: ✓ 共 ${imagePaths.length} 张，发送顺序：`);
    imagePaths.forEach((p, i) => console.log(`  ${i + 1}. ${path.basename(p)}`));
  }

  // 检查所有图片的新鲜度
  for (const p of imagePaths) {
    if (!checkFileIsFresh(p)) process.exit(1);
  }

  const ok = await sendManualWeeklyEmail(
    subject,
    summary,
    dateRange || subject,
    imagePaths,
  );

  if (!ok) process.exit(1);

  // 发送成功后清理所有图片
  for (const p of imagePaths) {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      console.log(`[WeeklyEmail] 已清理: ${path.basename(p)}`);
    }
  }

  console.log('[WeeklyEmail] 完成。');
})();
