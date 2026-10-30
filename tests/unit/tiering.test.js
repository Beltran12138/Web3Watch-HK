/**
 * lib/tiering.js FLASH（安全突发）判定
 * 正例 = 2026-10-29/30 Binance 热钱包被盗当晚实际抓到、却没推出去的标题；反例 = 同期日志里的误报/日常公告
 */

const { classify } = require('../../lib/tiering');

const tierOf = (title, source = 'BlockBeats') => classify({ title, source }).tier;

describe('FLASH: security incidents', () => {
  test.each([
    '市场消息：Binance热钱包疑似遭遇大额异常流出，涉及超60种代币、约25.3亿美元资产',
    '币圈惊魂夜：币安被盗 58 亿美元，复盘加密史上最大黑客攻击',
    '币安 8 条链热钱包被盗 62.8 亿美元，复盘黑客攻击完整时间线与攻防始末',
    'Binance黑客已完成对UNI、ENA、PEPE等大额盗取山寨币的抛售',
    'Binance pauses withdrawals as hackers suspected of stealing billions in crypto',
    'Binance suspends withdrawals while it investigates a potential security issue',
    'Unusual outflows from Bybit hot wallet',
  ])('%s → FLASH', title => {
    expect(tierOf(title)).toBe('FLASH');
  });

  test.each([
    // 审计公司 Hacken 不是 hack（10-28 误报）
    ['MEXC and Hacken Launch AI Trading Safety Handbook to Promote Safer AI Adoption', 'PRNewswire'],
    // 例行维护的暂停提现
    ['Binance Will Temporarily Suspend Deposits and Withdrawals on the Sonic Network for Upgrade', 'Binance'],
    ['OKX 关于暂停 TRX 充提的公告', 'OKX'],
    // 黑客松
    ['Binance Hackathon 2026 opens registration', 'BlockBeats'],
    // 没点名交易所 / 香港语境
    ['某 DeFi 协议遭黑客攻击损失 300 万美元', 'BlockBeats'],
    // ETF 资金流出不是安全事件
    ['Bitcoin ETFs see $500M outflows as BTC slides', 'BlockBeats'],
  ])('%s → not FLASH', (title, source) => {
    expect(tierOf(title, source)).not.toBe('FLASH');
  });

  test('KOL sources never produce FLASH', () => {
    expect(tierOf('币安被盗 58 亿美元', 'Phyrex')).not.toBe('FLASH');
  });
});
