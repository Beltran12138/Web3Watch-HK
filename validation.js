'use strict';

/**
 * validation.js — Zod 输入验证中间件
 * 
 * 为 Express API 提供 schema 验证
 */

const { z } = require('zod');
const { ZodError } = require('zod');

const validationMiddleware = (schema) => {
  return (req, res, next) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors,
        });
      }
      return res.status(500).json({
        status: 'error',
        message: 'Internal validation error',
      });
    }
  };
};

const createQuerySchema = (schema) => z.object({ query: schema });
const createBodySchema = (schema) => z.object({ body: schema });
const createParamsSchema = (schema) => z.object({ params: schema });

const NewsQuerySchema = z.object({
  query: z.object({
    source: z.string().optional(),
    category: z.string().optional(),
    importance: z.coerce.number().min(0).max(100).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  }),
});

const NewsIdSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

const StatsQuerySchema = z.object({
  query: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
});

const PushTestSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200),
    content: z.string().min(1).max(5000),
    channels: z.array(z.enum(['wecom', 'dingtalk', 'slack', 'telegram', 'email'])).optional(),
  }),
});

const AIStatusQuerySchema = z.object({
  query: z.object({
    detailed: z.coerce.boolean().optional(),
  }),
});

const ArchiveQuerySchema = z.object({
  query: z.object({
    olderThanDays: z.coerce.number().int().min(1).max(365).default(90),
    dryRun: z.coerce.boolean().optional(),
  }),
});

const CleanupQuerySchema = z.object({
  query: z.object({
    type: z.enum(['hot', 'warm', 'cold', 'all']).optional(),
    dryRun: z.coerce.boolean().optional(),
  }),
});

module.exports = {
  validationMiddleware,
  createQuerySchema,
  createBodySchema,
  createParamsSchema,
  NewsQuerySchema,
  NewsIdSchema,
  StatsQuerySchema,
  PushTestSchema,
  AIStatusQuerySchema,
  ArchiveQuerySchema,
  CleanupQuerySchema,
};
