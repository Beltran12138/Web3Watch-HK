'use strict';

/**
 * config-loader.js — 配置文件加载器
 *
 * 支持从 YAML 文件动态加载数据源配置
 * 用法：
 *   const { loadSourcesConfig } = require('./config-loader');
 *   const sources = loadSourcesConfig();
 */

const fs = require('fs');
const path = require('path');

// 尝试加载 js-yaml，如果不存在则使用内置的 JSON 解析
let yaml = null;
try {
  yaml = require('js-yaml');
} catch (e) {
  console.warn('[ConfigLoader] js-yaml not installed, YAML support disabled');
  console.warn('[ConfigLoader] Run: npm install js-yaml');
}

/**
 * 加载 YAML 配置文件
 * @param {string} filePath - YAML 文件路径
 * @returns {Object|null} - 解析后的配置对象
 */
function loadYamlConfig(filePath) {
  if (!yaml) {
    console.error('[ConfigLoader] Cannot load YAML without js-yaml package');
    return null;
  }

  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const config = yaml.load(fileContent);
    console.log(`[ConfigLoader] Loaded YAML config from ${filePath}`);
    return config;
  } catch (err) {
    console.error(`[ConfigLoader] Failed to load YAML: ${err.message}`);
    return null;
  }
}

/**
 * 从 YAML 配置构建数据源映射
 * @param {Object} yamlConfig - YAML 配置对象
 * @returns {Object} - 数据源映射（name -> config）
 */
function buildSourceMap(yamlConfig) {
  const sourceMap = {};

  // 处理高频源
  if (yamlConfig.high_frequency && Array.isArray(yamlConfig.high_frequency)) {
    for (const source of yamlConfig.high_frequency) {
      if (source.enabled !== false) {
        sourceMap[source.name] = {
          ...source,
          tier: 'high',
        };
      }
    }
  }

  // 处理低频源
  if (yamlConfig.low_frequency && Array.isArray(yamlConfig.low_frequency)) {
    for (const source of yamlConfig.low_frequency) {
      if (source.enabled !== false) {
        sourceMap[source.name] = {
          ...source,
          tier: 'low',
        };
      }
    }
  }

  return sourceMap;
}

/**
 * 应用默认配置到源配置
 * @param {Object} sourceConfig - 单个源配置
 * @param {Object} defaults - 默认配置
 * @returns {Object} - 合并后的配置
 */
function applyDefaults(sourceConfig, defaults = {}) {
  return {
    maxAgeHours: sourceConfig.maxAgeHours || defaults.maxAgeHours || 48,
    enableStrictTimestamp: sourceConfig.enableStrictTimestamp ?? defaults.enableStrictTimestamp ?? false,
    dedupMode: sourceConfig.dedupMode || defaults.dedupMode || 'normal',
    pushCooldownHours: sourceConfig.pushCooldownHours || defaults.pushCooldownHours || 24,
    ...sourceConfig,
  };
}

/**
 * 加载所有数据源配置
 * @param {string} [configPath] - 可选的配置文件路径
 * @returns {Object} - { sources: Object, settings: Object }
 */
function loadSourcesConfig(configPath) {
  const defaultPath = path.join(__dirname, 'sources.yaml');
  const filePath = configPath || defaultPath;

  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    console.warn(`[ConfigLoader] Config file not found: ${filePath}`);
    console.warn('[ConfigLoader] Using built-in config from config.js');
    return null;
  }

  // 加载 YAML 配置
  const yamlConfig = loadYamlConfig(filePath);
  if (!yamlConfig) {
    return null;
  }

  // 构建源映射
  const sourceMap = buildSourceMap(yamlConfig);

  // 应用默认配置
  const defaults = yamlConfig.settings?.defaults || {};
  for (const [name, config] of Object.entries(sourceMap)) {
    sourceMap[name] = applyDefaults(config, defaults);
  }

  console.log(`[ConfigLoader] Loaded ${Object.keys(sourceMap).length} sources from YAML`);

  return {
    sources: sourceMap,
    settings: yamlConfig.settings || {},
    rawConfig: yamlConfig,
  };
}

/**
 * 获取启用的数据源列表
 * @param {string} [tier] - 可选的层级过滤 ('high' | 'low')
 * @returns {Array<string>} - 启用的源名称数组
 */
function getEnabledSources(tier) {
  const config = loadSourcesConfig();
  if (!config) return [];

  const sources = Object.entries(config.sources)
    .filter(([_, conf]) => conf.enabled !== false)
    .filter(([_, conf]) => !tier || conf.tier === tier)
    .map(([name, _]) => name);

  return sources;
}

/**
 * 动态更新某个源的配置（运行时修改）
 * @param {string} sourceName - 源名称
 * @param {Object} updates - 要更新的配置项
 */
function updateSourceConfig(sourceName, updates) {
  const config = loadSourcesConfig();
  if (!config || !config.sources[sourceName]) {
    throw new Error(`Source "${sourceName}" not found`);
  }

  config.sources[sourceName] = {
    ...config.sources[sourceName],
    ...updates,
  };

  console.log(`[ConfigLoader] Updated config for source: ${sourceName}`);
  return config.sources[sourceName];
}

/**
 * 导出为 JSON（用于前端展示）
 * @returns {Object} - JSON 格式的配置
 */
function exportToJson() {
  const config = loadSourcesConfig();
  if (!config) return { sources: [], settings: {} };

  return {
    sources: Object.entries(config.sources).map(([name, conf]) => ({
      name,
      ...conf,
    })),
    settings: config.settings,
  };
}

module.exports = {
  loadSourcesConfig,
  getEnabledSources,
  updateSourceConfig,
  exportToJson,
  loadYamlConfig,
};
