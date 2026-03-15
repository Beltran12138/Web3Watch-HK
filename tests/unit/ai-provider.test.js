'use strict';
/**
 * tests/unit/ai-provider.test.js — AI provider & rule engine tests
 */

const { ruleEngine } = require('../../ai-provider');

describe('ruleEngine.classifyByKeywords', () => {
  test('classifies regulatory keywords', () => {
    expect(ruleEngine.classifyByKeywords('SFC 牌照审批新规')).toBe('合规');
    expect(ruleEngine.classifyByKeywords('SEC 处罚交易所违规')).toBe('监管');
    expect(ruleEngine.classifyByKeywords('香港新政策法规落地')).toBe('政策');
  });

  test('classifies RWA keywords', () => {
    expect(ruleEngine.classifyByKeywords('RWA 代币化平台上线')).toBe('RWA');
  });

  test('classifies finance keywords', () => {
    expect(ruleEngine.classifyByKeywords('某公司完成 Series A 融资')).toBe('投融资');
  });

  test('returns "其他" for unclassifiable', () => {
    expect(ruleEngine.classifyByKeywords('今天天气真好')).toBe('其他');
  });
});

describe('ruleEngine.classifyCompetitor', () => {
  test('classifies HK exchanges', () => {
    expect(ruleEngine.classifyCompetitor('HashKey 新服务', '', 'HashKeyExchange')).toBe('香港合规所');
    expect(ruleEngine.classifyCompetitor('OSL 托管', '', 'OSL')).toBe('香港合规所');
  });

  test('classifies offshore exchanges', () => {
    expect(ruleEngine.classifyCompetitor('Binance 新产品', '', 'Binance')).toBe('离岸所');
    expect(ruleEngine.classifyCompetitor('OKX 扩张', '', 'OKX')).toBe('离岸所');
  });

  test('classifies policy items', () => {
    expect(ruleEngine.classifyCompetitor('SFC 新监管框架')).toBe('政策');
  });
});

describe('ruleEngine.calculateImportance', () => {
  test('high-priority keywords boost score', () => {
    const score = ruleEngine.calculateImportance('SFC 牌照审批重大变更');
    expect(score).toBeGreaterThanOrEqual(70);
  });

  test('high-priority sources boost score', () => {
    const score = ruleEngine.calculateImportance('一般性公告', '', 'SFC');
    expect(score).toBeGreaterThan(50);
  });

  test('generic news has base score', () => {
    const score = ruleEngine.calculateImportance('Today is a nice day');
    expect(score).toBe(50);
  });

  test('score caps at 100', () => {
    const score = ruleEngine.calculateImportance(
      'SFC 牌照 监管 处罚 CEO 收购',
      '被盗 hack merger',
      'SFC'
    );
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('ruleEngine.process', () => {
  test('returns complete result object', () => {
    const result = ruleEngine.process('HashKey 获得 SFC 牌照', 'content', 'HashKeyExchange');
    expect(result).toHaveProperty('business_category');
    expect(result).toHaveProperty('competitor_category');
    expect(result).toHaveProperty('detail');
    expect(result).toHaveProperty('alpha_score');
    expect(result).toHaveProperty('is_important');
    expect(result).toHaveProperty('impact');
    expect(result).toHaveProperty('bitv_action');
    expect(result).toHaveProperty('_source', 'rule_engine');
  });

  test('correctly classifies HK compliance news', () => {
    const result = ruleEngine.process('HashKey 获得零售牌照', '', 'HashKeyExchange');
    expect(result.business_category).toBe('合规');
    expect(result.competitor_category).toBe('香港合规所');
  });
});
