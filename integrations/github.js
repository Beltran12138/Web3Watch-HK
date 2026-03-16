'use strict';

/**
 * integrations/github.js — GitHub 集成
 *
 * 功能：
 *   1. 高价值情报自动创建 GitHub Issues（作为讨论区）
 *   2. 定期导出 CSV/JSON 到 GitHub Releases
 *   3. Webhook 触发自动更新
 *
 * 配置：
 *   GITHUB_TOKEN=ghp_xxx
 *   GITHUB_REPO=username/repo-name
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ── 配置 ─────────────────────────────────────────────────────────────────────
const GITHUB_CONFIG = {
  TOKEN: process.env.GITHUB_TOKEN,
  REPO: process.env.GITHUB_REPO, // 格式：owner/repo
  BASE_URL: 'https://api.github.com',
};

// ── GitHub API 客户端 ───────────────────────────────────────────────────────
class GitHubClient {
  constructor() {
    this.token = GITHUB_CONFIG.TOKEN;
    this.repo = GITHUB_CONFIG.REPO;
    this.baseUrl = GITHUB_CONFIG.BASE_URL;

    if (!this.token || !this.repo) {
      console.warn('[GitHub] Not fully configured (missing TOKEN or REPO)');
      this.enabled = false;
    } else {
      this.enabled = true;
    }

    // 解析 repo
    const [owner, repo] = (this.repo || '').split('/');
    this.owner = owner;
    this.repoName = repo;
  }

  /**
   * 发送 API 请求
   */
  async request(method, endpoint, data = null) {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const res = await axios({
        method,
        url,
        data,
        headers: {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      return res.data;
    } catch (err) {
      console.error(`[GitHub] API error (${method} ${endpoint}):`, err.response?.data || err.message);
      throw err;
    }
  }

  /**
   * 创建 Issue
   */
  async createIssue(title, body, labels = []) {
    return await this.request('POST', `/repos/${this.owner}/${this.repoName}/issues`, {
      title,
      body,
      labels,
    });
  }

  /**
   * 更新 Issue
   */
  async updateIssue(issueNumber, updates) {
    return await this.request('PATCH', `/repos/${this.owner}/${this.repoName}/issues/${issueNumber}`, updates);
  }

  /**
   * 查询 Issue
   */
  async searchIssues(query) {
    return await this.request('GET', `/search/issues?q=${encodeURIComponent(query)}`);
  }

  /**
   * 创建 Release
   */
  async createRelease(tag, name, body, draft = false) {
    return await this.request('POST', `/repos/${this.owner}/${this.repoName}/releases`, {
      tag_name: tag,
      name,
      body,
      draft,
      prerelease: false,
    });
  }

  /**
   * 上传 Release Asset
   */
  async uploadReleaseAsset(releaseId, fileName, fileContent, contentType = 'text/plain') {
    const uploadUrl = `https://uploads.github.com/repos/${this.owner}/${this.repoName}/releases/${releaseId}/assets`;
    
    try {
      const res = await axios.post(uploadUrl, fileContent, {
        headers: {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': contentType,
        },
        params: {
          name: fileName,
        },
        timeout: 30000,
      });

      return res.data;
    } catch (err) {
      console.error(`[GitHub] Upload asset error:`, err.response?.data || err.message);
      throw err;
    }
  }

  /**
   * 获取最新 Release
   */
  async getLatestRelease() {
    return await this.request('GET', `/repos/${this.owner}/${this.repoName}/releases/latest`);
  }
}

// ── GitHub 集成管理器 ───────────────────────────────────────────────────────
class GitHubIntegration {
  constructor() {
    this.client = new GitHubClient();
    this.createdIssues = new Map(); // title -> issueNumber
  }

  /**
   * 将情报转换为 Issue 内容
   */
  buildIssueBody(item) {
    const scoreEmoji = item.alpha_score >= 85 ? '🔴' : 
                       item.alpha_score >= 60 ? '🟡' : '🔵';

    let body = `## 情报详情\n\n`;
    body += `**来源**: ${item.source}\n`;
    body += `**评分**: ${scoreEmoji} ${item.alpha_score}/100\n`;
    body += `**分类**: ${item.business_category || '未分类'}\n`;
    body += `**影响**: ${item.impact || '中性'}\n\n`;

    if (item.detail) {
      body += `## 摘要\n${item.detail}\n\n`;
    }

    if (item.bitv_action) {
      body += `## 建议行动\n${item.bitv_action}\n\n`;
    }

    body += `---\n\n`;
    body += `📅 发布时间：${new Date(item.timestamp).toLocaleString('zh-CN')}\n`;
    body += `🔗 [原文链接](${item.url})\n`;
    body += `\n*此 Issue 由 Alpha Radar 自动生成*`;

    return body;
  }

  /**
   * 为情报创建 Issue
   * @param {Object} item - 情报条目
   * @returns {Promise<Object|null>} - Issue 信息或 null
   */
  async createIssueForItem(item) {
    if (!this.client.enabled) {
      console.log('[GitHub] Disabled, skipping issue creation');
      return null;
    }

    // 检查是否已创建
    const cacheKey = `${item.title}-${item.source}`;
    if (this.createdIssues.has(cacheKey)) {
      console.log(`[GitHub] Issue already created: ${item.title.slice(0, 50)}`);
      return null;
    }

    try {
      // 构建标签
      const labels = ['intelligence'];
      if (item.alpha_score >= 85) labels.push('critical');
      if (item.alpha_score >= 60) labels.push('high-priority');
      if (item.business_category) labels.push(item.business_category.replace('/', '-'));
      if (item.source) labels.push(`source:${item.source}`);

      // 创建 Issue
      const issue = await this.client.createIssue(
        `[${item.alpha_score}] ${item.title.slice(0, 100)}`,
        this.buildIssueBody(item),
        labels.slice(0, 10) // GitHub 限制最多 10 个标签
      );

      this.createdIssues.set(cacheKey, issue.number);
      console.log(`[GitHub] Created issue #${issue.number}: ${item.title.slice(0, 50)}`);

      return {
        number: issue.number,
        url: issue.html_url,
        createdAt: issue.created_at,
      };
    } catch (err) {
      console.error('[GitHub] Failed to create issue:', err.message);
      return null;
    }
  }

  /**
   * 批量创建 Issues
   * @param {Array} items - 情报列表
   * @param {Object} options - 选项
   * @returns {Promise<Object>} - 创建结果统计
   */
  async createBatchIssues(items, options = {}) {
    const {
      minScore = 70,
      limit = 10,
    } = options;

    if (!this.client.enabled) {
      return { success: 0, failed: 0, skipped: items.length, reason: 'disabled' };
    }

    // 过滤高价值情报
    const valuableItems = items
      .filter(item => item.alpha_score >= minScore)
      .slice(0, limit);

    console.log(`[GitHub] Creating issues for ${valuableItems.length} items...`);

    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      issues: [],
    };

    for (const item of valuableItems) {
      const result = await this.createIssueForItem(item);
      if (result) {
        results.success++;
        results.issues.push({
          title: item.title,
          number: result.number,
          url: result.url,
        });
      } else {
        const cacheKey = `${item.title}-${item.source}`;
        if (this.createdIssues.has(cacheKey)) {
          results.skipped++;
        } else {
          results.failed++;
        }
      }

      // 避免速率限制（GitHub API: 5000 requests/hour）
      if (valuableItems.indexOf(item) < valuableItems.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    console.log(`[GitHub] Batch complete: ${results.success} created, ${results.failed} failed`);
    return results;
  }

  /**
   * 导出每日情报到 GitHub Release
   * @param {Array} items - 当日情报
   * @param {string} dateStr - 日期字符串（YYYY-MM-DD）
   * @returns {Promise<Object>} - Release 信息
   */
  async exportDailyToRelease(items, dateStr) {
    if (!this.client.enabled) {
      return { success: false, reason: 'disabled' };
    }

    try {
      // 生成 CSV 内容
      const csvContent = this.generateCSV(items);
      const jsonContent = JSON.stringify(items, null, 2);

      // 创建 Release
      const tag = `daily-${dateStr}`;
      const release = await this.client.createRelease(
        tag,
        `Alpha Radar Daily Export - ${dateStr}`,
        `## 每日情报导出\n\n- 总条数：${items.length}\n- 高价值：${items.filter(i => i.alpha_score >= 85).length}\n- 平均评分：${(items.reduce((sum, i) => sum + i.alpha_score, 0) / items.length).toFixed(1)}\n\n自动生成于 ${new Date().toLocaleString('zh-CN')}`,
        false
      );

      // 上传 CSV 文件
      await this.client.uploadReleaseAsset(
        release.id,
        `alpha-radar-${dateStr}.csv`,
        csvContent,
        'text/csv'
      );

      // 上传 JSON 文件
      await this.client.uploadReleaseAsset(
        release.id,
        `alpha-radar-${dateStr}.json`,
        jsonContent,
        'application/json'
      );

      console.log(`[GitHub] Created daily release ${tag} with ${items.length} items`);

      return {
        success: true,
        releaseId: release.id,
        url: release.html_url,
        tagName: tag,
      };
    } catch (err) {
      console.error('[GitHub] Export to release failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * 生成 CSV 格式
   */
  generateCSV(items) {
    const headers = ['ID', 'Title', 'Source', 'Category', 'Alpha Score', 'Impact', 'Timestamp', 'URL'];
    
    const rows = items.map(item => [
      item.id || '',
      `"${(item.title || '').replace(/"/g, '""')}"`,
      item.source || '',
      item.business_category || '',
      item.alpha_score || 0,
      item.impact || '',
      new Date(item.timestamp).toISOString(),
      item.url || '',
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  /**
   * 获取集成状态
   */
  getStatus() {
    return {
      enabled: this.client.enabled,
      repo: this.client.repo || 'not configured',
      owner: this.client.owner,
      repoName: this.client.repoName,
      issuesCreated: this.createdIssues.size,
    };
  }
}

// ── 导出单例 ─────────────────────────────────────────────────────────────────
const githubIntegration = new GitHubIntegration();

module.exports = {
  githubIntegration,
  GitHubIntegration,
  GitHubClient,
  GITHUB_CONFIG,
};
