'use strict';

/**
 * swagger.js — Swagger/OpenAPI 文档配置
 */

const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Alpha-Radar API',
      version: '2.0.0',
      description: 'Web3/Crypto 行业情报聚合系统 API 文档',
      contact: {
        name: 'Alpha-Radar Team',
        url: 'https://github.com/Beltran12138/industry-feeds',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: '本地开发服务器',
      },
      {
        url: 'https://alpha-radar.vercel.app',
        description: '生产服务器',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API 密钥认证',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        News: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            content: { type: 'string' },
            source: { type: 'string' },
            url: { type: 'string', format: 'uri' },
            published_at: { type: 'string', format: 'date-time' },
            category: { type: 'string' },
            importance: { type: 'integer' },
            is_important: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Stats: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            important: { type: 'integer' },
            sources: {
              type: 'array',
              items: { type: 'object' },
            },
            categories: {
              type: 'array',
              items: { type: 'object' },
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            message: { type: 'string' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    security: [
      { ApiKeyAuth: [] },
    ],
  },
  apis: ['./server.js', './routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

const setupSwagger = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Alpha-Radar API Docs',
    customfavIcon: '/favicon.ico',
  }));

  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
};

module.exports = { setupSwagger, swaggerSpec };
