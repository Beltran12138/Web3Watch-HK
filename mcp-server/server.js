'use strict';
/**
 * mcp-server/server.js — 独立运行的 MCP Server
 *
 * 使用 @modelcontextprotocol/sdk 启动标准 MCP 服务
 * 支持 stdio 和 SSE 两种传输模式
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const {
  mcpServer,
  TOOLS,
  RESOURCES,
} = require('./index');

// ── 创建 MCP Server 实例 ──────────────────────────────────────────────────────

const server = new Server(
  {
    name: 'alpha-radar',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// ── 注册工具处理器 ───────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  console.error(`[MCP] Calling tool: ${name}`, args);

  try {
    const result = await mcpServer.callTool(name, args);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    console.error(`[MCP] Tool call error: ${name}`, err);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${err.message}`,
        },
      ],
      isError: true,
    };
  }
});

// ── 注册资源处理器 ───────────────────────────────────────────────────────────

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: RESOURCES.map(resource => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType,
    })),
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  console.error(`[MCP] Reading resource: ${uri}`);

  try {
    const result = await mcpServer.readResource(uri);

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    console.error(`[MCP] Resource read error: ${uri}`, err);
    return {
      contents: [],
      isError: true,
    };
  }
});

// ── 启动服务器 ───────────────────────────────────────────────────────────────

async function main() {
  try {
    // 使用 stdio 传输（适用于 Claude Desktop 本地调用）
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error('[MCP] Alpha-Radar MCP Server running on stdio');
    console.error('[MCP] Tools:', TOOLS.map(t => t.name).join(', '));
    console.error('[MCP] Resources:', RESOURCES.map(r => r.uri).join(', '));
  } catch (err) {
    console.error('[MCP] Failed to start server:', err);
    process.exit(1);
  }
}

main();
