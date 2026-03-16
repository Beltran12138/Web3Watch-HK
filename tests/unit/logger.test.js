'use strict';

const logger = require('../../lib/logger');

describe('Logger', () => {
  it('should export logger object', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('should support child logger', () => {
    const childLogger = logger.child({ component: 'test' });
    expect(childLogger).toBeDefined();
    expect(typeof childLogger.info).toBe('function');
  });

  it('should log messages without error', () => {
    expect(() => {
      logger.info({ test: true }, 'Test message');
      logger.warn({ warning: true }, 'Warning message');
      logger.debug({ debug: true }, 'Debug message');
    }).not.toThrow();
  });

  it('should log errors without error', () => {
    const testError = new Error('Test error');
    expect(() => {
      logger.error({ err: testError }, 'Error message');
    }).not.toThrow();
  });
});
