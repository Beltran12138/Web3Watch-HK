'use strict';

/**
 * 熔断器模式实现
 * 当某个服务连续失败达到一定阈值时，自动"熔断"，暂停对该服务的调用
 * 避免资源浪费和错误日志风暴
 *
 * 使用方式:
 * const breaker = new CircuitBreaker('binance', { failureThreshold: 5, resetTimeout: 60000 });
 * const result = await breaker.execute(() => fetchBinanceData());
 */

const logger = require('./logger');

const State = {
  CLOSED: 'CLOSED',     // 正常状态，允许请求
  OPEN: 'OPEN',         // 熔断状态，拒绝请求
  HALF_OPEN: 'HALF_OPEN' // 半开状态，试探性允许请求
};

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 60秒
    this.successThreshold = options.successThreshold || 2;

    this.state = State.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
      lastError: null,
    };
  }

  async execute(fn, ...args) {
    this.stats.totalCalls++;

    if (this.state === State.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        logger.info({ breaker: this.name }, 'Circuit breaker entering HALF_OPEN state');
        this.state = State.HALF_OPEN;
        this.successCount = 0;
      } else {
        this.stats.rejectedCalls++;
        throw new Error(`Circuit breaker is OPEN for ${this.name}. Request rejected.`);
      }
    }

    try {
      const result = await fn(...args);
      this.onSuccess();
      this.stats.successfulCalls++;
      return result;
    } catch (error) {
      this.onFailure(error);
      this.stats.failedCalls++;
      this.stats.lastError = error.message;
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;

    if (this.state === State.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        logger.info({ breaker: this.name }, 'Circuit breaker CLOSED');
        this.state = State.CLOSED;
        this.successCount = 0;
      }
    }
  }

  onFailure(error) {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      logger.warn({
        breaker: this.name,
        failureCount: this.failureCount,
        error: error.message
      }, 'Circuit breaker OPENED due to failures');
      this.state = State.OPEN;
    }
  }

  getState() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      stats: { ...this.stats },
      lastFailureTime: this.lastFailureTime,
    };
  }

  reset() {
    this.state = State.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    logger.info({ breaker: this.name }, 'Circuit breaker manually reset');
  }
}

// 全局熔断器管理器
class CircuitBreakerRegistry {
  constructor() {
    this.breakers = new Map();
  }

  get(name, options) {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, options));
    }
    return this.breakers.get(name);
  }

  getAllStates() {
    const states = {};
    for (const [name, breaker] of this.breakers) {
      states[name] = breaker.getState();
    }
    return states;
  }

  reset(name) {
    const breaker = this.breakers.get(name);
    if (breaker) breaker.reset();
  }

  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

const registry = new CircuitBreakerRegistry();

module.exports = {
  CircuitBreaker,
  CircuitBreakerRegistry,
  registry,
  State,
};
