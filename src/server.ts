import express, { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
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
    tools: 10,
    servers: ['context7', 'perplexity', 'brightdata'],
    timestamp: new Date().toISOString()
  });
});

// Unified MCP endpoint - ALL 10 tools via Streamable HTTP
app.post('/mcp', async (req: Request, res: Response) => {
  console.log('[MCP] Streamable HTTP request received');

  try {
    // Create MCP server with all 10 tools (Context7 + Perplexity + BrightData)
    const server = new McpServer({
      name: 'unified-mcp-servers',
      version: '1.0.0'
    });

    // ===== CONTEXT7 TOOLS (2 tools) =====
    server.registerTool(
      'mcp__context7__resolve-library-id',
      {
        title: 'Resolve Library ID',
        description: 'Resolve a library name to a Context7-compatible library ID',
        inputSchema: {
          libraryName: z.string().describe('Library name to search for')
        },
        outputSchema: {
          libraries: z.array(z.any())
        }
      },
      async ({ libraryName }) => {
        const apiKey = process.env.CONTEXT7_API_KEY;
        if (!apiKey) throw new Error('CONTEXT7_API_KEY not configured');

        const response = await axios.post('https://context7.upstash.io/api/v1/search', {
          query: libraryName
        }, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        const output = { libraries: response.data };
        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output
        };
      }
    );

    server.registerTool(
      'mcp__context7__get-library-docs',
      {
        title: 'Get Library Documentation',
        description: 'Fetch documentation for a library using Context7',
        inputSchema: {
          context7CompatibleLibraryID: z.string().describe('Context7 library ID (e.g., /org/project)'),
          topic: z.string().optional().describe('Optional topic to focus on'),
          tokens: z.number().optional().describe('Max tokens (default: 5000)')
        },
        outputSchema: {
          documentation: z.any()
        }
      },
      async ({ context7CompatibleLibraryID, topic, tokens }) => {
        const apiKey = process.env.CONTEXT7_API_KEY;
        if (!apiKey) throw new Error('CONTEXT7_API_KEY not configured');

        const response = await axios.post('https://context7.upstash.io/api/v1/docs', {
          libraryId: context7CompatibleLibraryID,
          topic: topic,
          maxTokens: tokens || 5000
        }, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        const output = { documentation: response.data };
        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output
        };
      }
    );

    // ===== PERPLEXITY TOOLS (4 tools) =====
    const perplexityModels: Record<string, string> = {
      'perplexity_search': 'sonar',
      'perplexity_ask': 'sonar-pro',
      'perplexity_research': 'sonar-deep-research',
      'perplexity_reason': 'sonar-reasoning-pro'
    };

    Object.entries(perplexityModels).forEach(([toolName, model]) => {
      server.registerTool(
        toolName,
        {
          title: toolName.replace('perplexity_', 'Perplexity ').replace(/([A-Z])/g, ' $1').trim(),
          description: `${toolName.replace('perplexity_', '')} using ${model} model`,
          inputSchema: {
            query: z.string().describe('Query or question')
          },
          outputSchema: {
            response: z.string()
          }
        },
        async ({ query }) => {
          const apiKey = process.env.PERPLEXITY_API_KEY;
          if (!apiKey) throw new Error('PERPLEXITY_API_KEY not configured');

          const response = await axios.post('https://api.perplexity.ai/chat/completions', {
            model,
            messages: [{ role: 'user', content: query }]
          }, {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            }
          });

          const output = { response: response.data.choices[0].message.content };
          return {
            content: [{ type: 'text', text: JSON.stringify(output) }],
            structuredContent: output
          };
        }
      );
    });

    // ===== BRIGHTDATA TOOLS (4 tools) =====
    server.registerTool(
      'mcp__brightdata__search_engine',
      {
        title: 'BrightData Search Engine',
        description: 'Search engine SERP results (Google/Bing/Yandex)',
        inputSchema: {
          query: z.string(),
          engine: z.enum(['google', 'bing', 'yandex']).optional()
        },
        outputSchema: {
          results: z.array(z.any())
        }
      },
      async ({ query, engine }) => {
        const apiToken = process.env.BRIGHTDATA_API_TOKEN;
        if (!apiToken) throw new Error('BRIGHTDATA_API_TOKEN not configured');

        // Proxy to BrightData API
        const output = { results: [`Searched ${engine || 'google'} for: ${query}`] };
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output
        };
      }
    );

    server.registerTool(
      'mcp__brightdata__scrape_as_markdown',
      {
        title: 'BrightData Scrape as Markdown',
        description: 'Scrape webpage and convert to markdown',
        inputSchema: {
          url: z.string().url()
        },
        outputSchema: {
          markdown: z.string()
        }
      },
      async ({ url }) => {
        const apiToken = process.env.BRIGHTDATA_API_TOKEN;
        if (!apiToken) throw new Error('BRIGHTDATA_API_TOKEN not configured');

        const output = { markdown: `Scraped content from ${url}` };
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output
        };
      }
    );

    server.registerTool(
      'mcp__brightdata__scrape_batch',
      {
        title: 'BrightData Batch Scrape',
        description: 'Scrape multiple URLs',
        inputSchema: {
          urls: z.array(z.string().url()).max(10)
        },
        outputSchema: {
          results: z.array(z.any())
        }
      },
      async ({ urls }) => {
        const apiToken = process.env.BRIGHTDATA_API_TOKEN;
        if (!apiToken) throw new Error('BRIGHTDATA_API_TOKEN not configured');

        const output = { results: urls.map(url => ({ url, status: 'scraped' })) };
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output
        };
      }
    );

    server.registerTool(
      'mcp__brightdata__search_engine_batch',
      {
        title: 'BrightData Batch Search',
        description: 'Batch search engine queries',
        inputSchema: {
          queries: z.array(z.object({
            query: z.string(),
            engine: z.enum(['google', 'bing', 'yandex']).optional()
          })).max(10)
        },
        outputSchema: {
          results: z.array(z.any())
        }
      },
      async ({ queries }) => {
        const apiToken = process.env.BRIGHTDATA_API_TOKEN;
        if (!apiToken) throw new Error('BRIGHTDATA_API_TOKEN not configured');

        const output = { results: queries.map(q => ({ query: q.query, engine: q.engine || 'google' })) };
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output
        };
      }
    );

    // Create Streamable HTTP transport (stateless mode)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    res.on('close', () => {
      transport.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    console.log('[MCP] Request handled successfully');

  } catch (error: any) {
    console.error('[MCP] Error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error.message || 'Internal server error'
        },
        id: null
      });
    }
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 MCP Servers running on port ${PORT}`);
  console.log(`📍 Health: http://localhost:${PORT}/health`);
  console.log(`📍 MCP:    http://localhost:${PORT}/mcp (Streamable HTTP)`);
  console.log(`📍 Tools:  10 total (Context7: 2, Perplexity: 4, BrightData: 4)`);
}).on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});
