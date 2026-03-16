'use strict';

/**
 * Server-Sent Events (SSE) 管理器
 * 提供实时数据推送功能，比 WebSocket 更轻量，适合单向数据流
 */

const logger = require('./logger');

class SSEManager {
  constructor() {
    this.clients = new Map(); // clientId -> { res, heartbeatInterval, subscribedChannels }
    this.clientIdCounter = 0;
  }

  /**
   * 添加客户端连接
   */
  addClient(res, options = {}) {
    const clientId = ++this.clientIdCounter;

    // 设置 SSE 响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // 禁用 Nginx 缓冲
    });

    // 发送初始连接成功消息
    res.write(`event: connected\n`);
    res.write(`data: ${JSON.stringify({ clientId, time: Date.now() })}\n\n`);

    const client = {
      id: clientId,
      res,
      subscribedChannels: new Set(options.channels || ['news']),
      connectedAt: Date.now(),
      lastActivity: Date.now(),
    };

    this.clients.set(clientId, client);
    logger.info({ clientId, totalClients: this.clients.size }, 'SSE client connected');

    // 心跳保持连接
    const heartbeatInterval = setInterval(() => {
      if (!this.clients.has(clientId)) {
        clearInterval(heartbeatInterval);
        return;
      }
      try {
        res.write(`event: heartbeat\n`);
        res.write(`data: ${JSON.stringify({ time: Date.now() })}\n\n`);
        client.lastActivity = Date.now();
      } catch (err) {
        this.removeClient(clientId);
      }
    }, 30000); // 30秒心跳

    client.heartbeatInterval = heartbeatInterval;

    // 客户端断开连接时清理
    res.on('close', () => {
      this.removeClient(clientId);
    });

    res.on('error', (err) => {
      logger.error({ clientId, err: err.message }, 'SSE client error');
      this.removeClient(clientId);
    });

    return clientId;
  }

  /**
   * 移除客户端连接
   */
  removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (client.heartbeatInterval) {
      clearInterval(client.heartbeatInterval);
    }

    try {
      client.res.end();
    } catch (e) {
      // 忽略已关闭的连接错误
    }

    this.clients.delete(clientId);
    logger.info({ clientId, totalClients: this.clients.size }, 'SSE client disconnected');
  }

  /**
   * 向所有客户端广播消息
   */
  broadcast(event, data, channel = 'news') {
    const message = this.formatMessage(event, data);
    let sentCount = 0;

    for (const [clientId, client] of this.clients) {
      if (!client.subscribedChannels.has(channel)) continue;

      try {
        client.res.write(message);
        client.lastActivity = Date.now();
        sentCount++;
      } catch (err) {
        logger.error({ clientId, err: err.message }, 'Failed to send SSE message');
        this.removeClient(clientId);
      }
    }

    logger.debug({ event, channel, sentCount }, 'SSE broadcast');
    return sentCount;
  }

  /**
   * 向特定客户端发送消息
   */
  sendToClient(clientId, event, data) {
    const client = this.clients.get(clientId);
    if (!client) return false;

    try {
      client.res.write(this.formatMessage(event, data));
      client.lastActivity = Date.now();
      return true;
    } catch (err) {
      logger.error({ clientId, err: err.message }, 'Failed to send SSE message to client');
      this.removeClient(clientId);
      return false;
    }
  }

  /**
   * 格式化 SSE 消息
   */
  formatMessage(event, data) {
    const lines = [];
    if (event) {
      lines.push(`event: ${event}`);
    }
    lines.push(`data: ${JSON.stringify(data)}`);
    lines.push(''); // 空行表示消息结束
    return lines.join('\n') + '\n';
  }

  /**
   * 获取客户端统计
   */
  getStats() {
    const now = Date.now();
    const clients = Array.from(this.clients.values()).map(c => ({
      id: c.id,
      channels: Array.from(c.subscribedChannels),
      connectedAt: c.connectedAt,
      lastActivity: c.lastActivity,
      idleMs: now - c.lastActivity,
    }));

    return {
      totalClients: this.clients.size,
      clients,
    };
  }

  /**
   * 清理不活跃的客户端
   */
  cleanupInactive(maxIdleMs = 5 * 60 * 1000) { // 默认 5 分钟
    const now = Date.now();
    let cleaned = 0;

    for (const [clientId, client] of this.clients) {
      if (now - client.lastActivity > maxIdleMs) {
        this.removeClient(clientId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info({ cleaned, remaining: this.clients.size }, 'Cleaned up inactive SSE clients');
    }

    return cleaned;
  }

  /**
   * 关闭所有连接
   */
  closeAll() {
    for (const clientId of this.clients.keys()) {
      this.removeClient(clientId);
    }
    logger.info('All SSE connections closed');
  }
}

// 单例实例
const sseManager = new SSEManager();

module.exports = {
  SSEManager,
  sseManager,
};
