'use strict';
/**
 * scrapers/browser.js — 共享浏览器池
 *
 * 解决问题：原来每个爬虫函数都独立 launch/close，同批次会启动多个 Chrome 进程。
 * 现在改为：同一次 runAllScrapers() 调用共享一个浏览器实例，只开新 tab。
 *
 * 使用方法：
 *   const { getBrowser, closeBrowser } = require('./browser');
 *   const page = await (await getBrowser()).newPage();
 *   // ... 用完后
 *   await page.close();         // 关 tab，不关浏览器
 *   await closeBrowser();       // 所有任务结束后统一关
 */

const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin  = require('puppeteer-extra-plugin-stealth');
const { SCRAPER }    = require('../config');

puppeteerExtra.use(StealthPlugin());

let _browser    = null;
let _refCount   = 0;
let _closeTimer = null;

/**
 * 获取共享浏览器实例（懒加载，引用计数）
 */
async function getBrowser() {
  if (_closeTimer) {
    clearTimeout(_closeTimer);
    _closeTimer = null;
  }

  if (!_browser) {
    const options = {
      headless: 'new',
      args: SCRAPER.BROWSER_ARGS,
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      options.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    _browser = await puppeteerExtra.launch(options);
    console.log('[Browser] Launched shared browser instance');

    // 监听意外崩溃
    _browser.on('disconnected', () => {
      console.warn('[Browser] Browser disconnected unexpectedly, resetting pool');
      _browser   = null;
      _refCount  = 0;
    });
  }

  _refCount++;
  return _browser;
}

/**
 * 释放一次引用；所有调用者都释放后，延迟关闭浏览器（给并发任务留缓冲）
 */
async function releaseBrowser() {
  _refCount = Math.max(0, _refCount - 1);
  if (_refCount === 0 && _browser) {
    _closeTimer = setTimeout(async () => {
      if (_browser && _refCount === 0) {
        try { await _browser.close(); } catch (_) { /* ignore */ }
        _browser  = null;
        _refCount = 0;
        console.log('[Browser] Shared browser closed');
      }
    }, 3000); // 3s 缓冲
  }
}

/**
 * 强制立即关闭（runAllScrapers 结束时调用）
 */
async function closeBrowser() {
  if (_closeTimer) { clearTimeout(_closeTimer); _closeTimer = null; }
  if (_browser) {
    try { await _browser.close(); } catch (_) { /* ignore */ }
    _browser  = null;
    _refCount = 0;
    console.log('[Browser] Browser force-closed');
  }
}

/**
 * 便捷函数：打开新 tab，返回 page
 * 调用者 close page 后调用 releaseBrowser()
 */
async function newPage() {
  const browser = await getBrowser();
  const page    = await browser.newPage();
  await page.setUserAgent(SCRAPER.USER_AGENT);
  return page;
}

module.exports = { getBrowser, releaseBrowser, closeBrowser, newPage };
