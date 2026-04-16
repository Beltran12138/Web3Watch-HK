'use strict';
/**
 * email-report.js — 周报邮件发送模块
 *
 * 将 Markdown 格式的周报转换为 HTML 邮件，发送给领导层。
 *
 * 所需环境变量：
 *   SMTP_HOST          — SMTP 服务器地址（如 smtp.exmail.qq.com）
 *   SMTP_PORT          — SMTP 端口（默认 465）
 *   SMTP_USER          — 发件人邮箱
 *   SMTP_PASS          — 邮箱密码或授权码
 *   WEEKLY_EMAIL_TO    — 收件人列表，逗号分隔（如 boss@company.com,cto@company.com）
 *                        未配置时回退到 EMAIL_TO
 */

const nodemailer = require('nodemailer');

// ── Markdown → HTML 转换（内联实现，无额外依赖）────────────────────────────────

function markdownToHtml(md) {
  const lines = md.split('\n');
  const htmlLines = [];
  let inBlockquote = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // 水平分割线
    if (/^---+$/.test(line.trim())) {
      if (inBlockquote) { htmlLines.push('</blockquote>'); inBlockquote = false; }
      htmlLines.push('<hr style="border:none;border-top:1px solid #e0e0e0;margin:16px 0;">');
      continue;
    }

    // 引用块 > 开头
    if (line.startsWith('> ')) {
      if (!inBlockquote) {
        htmlLines.push('<blockquote style="margin:4px 0 4px 8px;padding:6px 12px;border-left:3px solid #00A7E1;background:#f0f9ff;color:#555;font-size:13px;">');
        inBlockquote = true;
      }
      line = inlineFormat(line.slice(2));
      htmlLines.push(`<div>${line}</div>`);
      continue;
    } else if (inBlockquote) {
      htmlLines.push('</blockquote>');
      inBlockquote = false;
    }

    // 空行
    if (line.trim() === '') {
      htmlLines.push('<div style="height:8px;"></div>');
      continue;
    }

    // 行内格式处理
    line = inlineFormat(line);
    htmlLines.push(`<div style="margin:3px 0;line-height:1.7;">${line}</div>`);
  }

  if (inBlockquote) htmlLines.push('</blockquote>');
  return htmlLines.join('\n');
}

function inlineFormat(text) {
  // **粗体**
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // `代码`
  text = text.replace(/`([^`]+)`/g, '<code style="background:#f4f4f4;padding:1px 4px;border-radius:3px;font-size:12px;color:#c7254e;">$1</code>');
  // [链接](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#00A7E1;text-decoration:none;">$1</a>');
  // • 转义为可见符号
  text = text.replace(/^(•\s*)/, '<span style="color:#00A7E1;">•</span> ');
  return text;
}

// ── 生成完整 HTML 邮件 ────────────────────────────────────────────────────────

function buildEmailHtml(reportContent, dateRange) {
  const body = markdownToHtml(reportContent);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Web3Watch HK 行业周报</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
    <tr><td align="center">
      <table width="680" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#00A7E1;padding:24px 32px;">
            <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">
              Web3Watch HK 行业周报
            </div>
            <div style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:6px;">
              ${dateRange} · 自动生成
            </div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;color:#333;font-size:14px;line-height:1.8;">
            ${body}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#fafafa;border-top:1px solid #eee;padding:16px 32px;">
            <div style="color:#999;font-size:12px;">
              本邮件由 Web3Watch HK 自动发送 · 每周五 18:00 · 如需调整请联系 ZHAO
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── 主入口 ────────────────────────────────────────────────────────────────────

/**
 * 发送周报邮件给领导层
 * @param {string} reportContent - 周报 Markdown 内容
 * @param {string} startDate     - 周报起始日期（如 "03/17"）
 * @param {string} endDate       - 周报结束日期（如 "03/21"）
 */
async function sendWeeklyReportEmail(reportContent, startDate, endDate) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
  const recipients = (process.env.WEEKLY_EMAIL_TO || process.env.EMAIL_TO || '').trim();

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('[Email] SMTP not configured, skipping weekly email.');
    return false;
  }
  if (!recipients) {
    console.warn('[Email] No recipients configured (WEEKLY_EMAIL_TO / EMAIL_TO), skipping.');
    return false;
  }

  const dateRange = `${startDate} ~ ${endDate}`;
  const subject   = `Web3Watch HK 行业周报 | ${dateRange}`;
  const html      = buildEmailHtml(reportContent, dateRange);

  const transporter = nodemailer.createTransport({
    host:   smtpHost,
    port:   smtpPort,
    secure: smtpPort === 465,
    auth:   { user: smtpUser, pass: smtpPass },
  });

  try {
    const info = await transporter.sendMail({
      from:    `"Web3Watch HK" <${smtpUser}>`,
      to:      recipients,
      subject,
      text:    reportContent,   // 纯文本备用
      html,
    });

    console.log(`[Email] Weekly report sent → ${recipients} (messageId: ${info.messageId})`);
    return true;
  } catch (err) {
    console.error('[Email] Failed to send weekly report:', err.message);
    return false;
  }
}

// ── 人工周报邮件（自定义标题 + 结论 + 图片 + PDF 附件）──────────────────────────

/**
 * 构建人工周报 HTML 邮件正文
 * @param {string} summary  - 本周结论/正文文字
 * @param {boolean} hasImage - 是否有内嵌图片
 */
function buildManualEmailHtml(summary, hasImage) {
  // 将纯文本结论转为 HTML 段落（按换行分段）
  const summaryHtml = summary
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => `<div style="margin:6px 0;line-height:1.8;">${line}</div>`)
    .join('\n');

  const imageSection = hasImage
    ? `<tr><td style="padding:0 32px 24px;">
        <img src="cid:weekly_report_image" alt="周报图片"
          style="width:100%;max-width:616px;border-radius:4px;border:1px solid #eee;">
      </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
    <tr><td align="center">
      <table width="680" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#00A7E1;padding:24px 32px;">
            <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">
              Web3Watch HK 行业周报
            </div>
            <div style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:6px;">
              自动发送
            </div>
          </td>
        </tr>

        <!-- Summary -->
        <tr>
          <td style="padding:28px 32px 20px;color:#333;font-size:14px;line-height:1.8;">
            ${summaryHtml}
          </td>
        </tr>

        <!-- Image -->
        ${imageSection}

        <!-- Footer -->
        <tr>
          <td style="background:#fafafa;border-top:1px solid #eee;padding:16px 32px;">
            <div style="color:#999;font-size:12px;">
              本邮件由 Web3Watch HK 自动发送 · 如需调整请联系 ZHAO
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * 发送人工周报邮件（自定义标题 + 结论 + 图片正文 + PDF 附件）
 * @param {string} subject   - 邮件标题
 * @param {string} summary   - 本周结论文字
 * @param {string|null} imagePath - 周报图片路径（weekly/image.png），可为 null
 * @param {string|null} pdfPath   - 周报 PDF 路径（weekly/report.pdf），可为 null
 */
async function sendManualWeeklyEmail(subject, summary, imagePath, pdfPath) {
  const fs = require('fs');

  const smtpHost   = process.env.SMTP_HOST;
  const smtpUser   = process.env.SMTP_USER;
  const smtpPass   = process.env.SMTP_PASS;
  const smtpPort   = parseInt(process.env.SMTP_PORT || '465', 10);
  const recipients = (process.env.WEEKLY_EMAIL_TO || process.env.EMAIL_TO || '').trim();

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('[Email] SMTP not configured, skipping.');
    return false;
  }
  if (!recipients) {
    console.warn('[Email] No recipients configured, skipping.');
    return false;
  }

  const hasImage = !!(imagePath && fs.existsSync(imagePath));
  const hasPdf   = !!(pdfPath   && fs.existsSync(pdfPath));

  if (!hasImage) console.warn('[Email] Image not found, sending without inline image.');
  if (!hasPdf)   console.warn('[Email] PDF not found, sending without attachment.');

  const html = buildManualEmailHtml(summary, hasImage);

  const attachments = [];
  if (hasImage) attachments.push({ filename: 'weekly-report.png', path: imagePath, cid: 'weekly_report_image' });
  if (hasPdf)   attachments.push({ filename: `${subject}.pdf`,    path: pdfPath });

  const transporter = nodemailer.createTransport({
    host:   smtpHost,
    port:   smtpPort,
    secure: smtpPort === 465,
    auth:   { user: smtpUser, pass: smtpPass },
  });

  try {
    const info = await transporter.sendMail({
      from:        `"Web3Watch HK" <${smtpUser}>`,
      to:          recipients,
      subject,
      text:        summary,
      html,
      attachments,
    });
    console.log(`[Email] Manual weekly email sent → ${recipients} (messageId: ${info.messageId})`);
    return true;
  } catch (err) {
    console.error('[Email] Failed to send manual weekly email:', err.message);
    return false;
  }
}

module.exports = { sendWeeklyReportEmail, sendManualWeeklyEmail };
