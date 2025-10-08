import express, { Request, Response } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'mcp-servers',
    servers: ['context7', 'perplexity', 'brightdata'],
    timestamp: new Date().toISOString()
  });
});

// Context7 MCP Server via SSE
app.get('/context7', async (req: Request, res: Response) => {
  console.log('[Context7] SSE connection initiated');

  const server = new Server(
    {
      name: 'context7-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register Context7 tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'mcp__context7__resolve-library-id',
        description: 'Resolve a library name to a Context7-compatible library ID',
        inputSchema: {
          type: 'object',
          properties: {
            libraryName: {
              type: 'string',
              description: 'Library name to search for'
            }
          },
          required: ['libraryName']
        }
      },
      {
        name: 'mcp__context7__get-library-docs',
        description: 'Fetch documentation for a library using Context7',
        inputSchema: {
          type: 'object',
          properties: {
            context7CompatibleLibraryID: {
              type: 'string',
              description: 'Context7-compatible library ID (e.g., /org/project)'
            },
            topic: {
              type: 'string',
              description: 'Optional topic to focus on'
            },
            tokens: {
              type: 'number',
              description: 'Maximum tokens to retrieve (default: 5000)'
            }
          },
          required: ['context7CompatibleLibraryID']
        }
      }
    ]
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // Proxy to Upstash Context7 API
      const apiKey = process.env.CONTEXT7_API_KEY;
      if (!apiKey) {
        throw new Error('CONTEXT7_API_KEY not configured');
      }

      if (name === 'mcp__context7__resolve-library-id') {
        const response = await axios.post('https://context7.upstash.io/api/v1/search', {
          query: args.libraryName
        }, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }]
        };
      } else if (name === 'mcp__context7__get-library-docs') {
        const response = await axios.post('https://context7.upstash.io/api/v1/docs', {
          libraryId: args.context7CompatibleLibraryID,
          topic: args.topic,
          maxTokens: args.tokens || 5000
        }, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(response.data, null, 2)
          }]
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error: ${error.message}`
        }],
        isError: true
      };
    }
  });

  // Create SSE transport
  const transport = new SSEServerTransport('/context7', res);
  await server.connect(transport);
  console.log('[Context7] SSE transport connected');
});

// Perplexity MCP Server via SSE
app.get('/perplexity', async (req: Request, res: Response) => {
  console.log('[Perplexity] SSE connection initiated');

  const server = new Server(
    {
      name: 'perplexity-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register Perplexity tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'perplexity_search',
        description: 'Direct web search using Perplexity Search API',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' }
          },
          required: ['query']
        }
      },
      {
        name: 'perplexity_ask',
        description: 'General-purpose conversational AI with sonar-pro model',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Question to ask' }
          },
          required: ['query']
        }
      },
      {
        name: 'perplexity_research',
        description: 'Deep research using sonar-deep-research model',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Research topic' }
          },
          required: ['query']
        }
      },
      {
        name: 'perplexity_reason',
        description: 'Advanced reasoning using sonar-reasoning-pro model',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Problem to analyze' }
          },
          required: ['query']
        }
      }
    ]
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey) {
        throw new Error('PERPLEXITY_API_KEY not configured');
      }

      // Map tool name to model
      const modelMap: Record<string, string> = {
        'perplexity_search': 'sonar',
        'perplexity_ask': 'sonar-pro',
        'perplexity_research': 'sonar-deep-research',
        'perplexity_reason': 'sonar-reasoning-pro'
      };

      const model = modelMap[name];
      if (!model) {
        throw new Error(`Unknown tool: ${name}`);
      }

      const response = await axios.post('https://api.perplexity.ai/chat/completions', {
        model,
        messages: [{ role: 'user', content: args.query }]
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        content: [{
          type: 'text',
          text: response.data.choices[0].message.content
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error: ${error.message}`
        }],
        isError: true
      };
    }
  });

  const transport = new SSEServerTransport('/perplexity', res);
  await server.connect(transport);
  console.log('[Perplexity] SSE transport connected');
});

// BrightData MCP Server via SSE
app.get('/brightdata', async (req: Request, res: Response) => {
  console.log('[BrightData] SSE connection initiated');

  const server = new Server(
    {
      name: 'brightdata-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register BrightData tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'mcp__brightdata__search_engine',
        description: 'Search engine SERP results',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            engine: { type: 'string', enum: ['google', 'bing', 'yandex'], default: 'google' }
          },
          required: ['query']
        }
      },
      {
        name: 'mcp__brightdata__scrape_as_markdown',
        description: 'Scrape webpage as markdown',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'uri', description: 'URL to scrape' }
          },
          required: ['url']
        }
      },
      {
        name: 'mcp__brightdata__scrape_batch',
        description: 'Scrape multiple URLs',
        inputSchema: {
          type: 'object',
          properties: {
            urls: { type: 'array', items: { type: 'string' }, maxItems: 10 }
          },
          required: ['urls']
        }
      },
      {
        name: 'mcp__brightdata__search_engine_batch',
        description: 'Batch search queries',
        inputSchema: {
          type: 'object',
          properties: {
            queries: { type: 'array', items: { type: 'object' }, maxItems: 10 }
          },
          required: ['queries']
        }
      }
    ]
  }));

  // Handle tool calls - proxy to BrightData API
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const apiToken = process.env.BRIGHTDATA_API_TOKEN;
      if (!apiToken) {
        throw new Error('BRIGHTDATA_API_TOKEN not configured');
      }

      // Proxy to BrightData API (implement actual API calls)
      return {
        content: [{
          type: 'text',
          text: `BrightData tool ${name} would be called with: ${JSON.stringify(args)}`
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error: ${error.message}`
        }],
        isError: true
      };
    }
  });

  const transport = new SSEServerTransport('/brightdata', res);
  await server.connect(transport);
  console.log('[BrightData] SSE transport connected');
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 MCP Servers running on port ${PORT}`);
  console.log(`📍 Health:     http://localhost:${PORT}/health`);
  console.log(`📍 Context7:   http://localhost:${PORT}/context7`);
  console.log(`📍 Perplexity: http://localhost:${PORT}/perplexity`);
  console.log(`📍 BrightData: http://localhost:${PORT}/brightdata`);
});
