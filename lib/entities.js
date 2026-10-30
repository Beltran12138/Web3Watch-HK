'use strict';
/**
 * lib/entities.js — 标题里点名的交易所 / 香港核心机构
 * 用于 FLASH 事件折叠（lib/flash.js）和跨源去重的实体守卫（filter.js semanticDedup）。
 */

// 标题里同时出现多个实体时取第一个命中的（按本表顺序）
const ENTITIES = [
  ['Binance', /binance|币安|幣安/i],
  ['OKX', /\bOKX\b|欧易/i],
  ['Bybit', /bybit/i],
  ['Bitget', /bitget/i],
  ['Gate', /\bgate(\.io|\.com)?\b|芝麻开门/i],
  ['KuCoin', /kucoin|库币/i],
  ['MEXC', /\bMEXC\b|抹茶/i],
  ['HTX', /\bHTX\b|HTX(?=[一-鿿])|火币|火幣/i],
  ['Kraken', /kraken/i],
  ['Crypto.com', /crypto\.com/i],
  ['Deribit', /deribit/i],
  ['BitMart', /bitmart/i],
  ['BingX', /bingx/i],
  ['WEEX', /\bWEEX\b/i],
  ['Backpack', /backpack/i],
  ['Hyperliquid', /hyperliquid/i],
  ['BIT', /\bBIT\b/],
  ['HashKey', /hashkey|HSK\s*Chain/i],
  ['OSL', /\bOSL\b|OSL(?=[一-鿿])/i],
  ['EX.IO', /\bEX\.?IO\b/i],
];

/** @returns {string|null} 第一个命中的实体名，没有则 null */
function titleEntity(title) {
  const t = title || '';
  for (const [name, re] of ENTITIES) if (re.test(t)) return name;
  return null;
}

module.exports = { ENTITIES, titleEntity };
