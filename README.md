# MCP Servers App

HTTP/SSE-based MCP servers for Context7, Perplexity, and BrightData.

## Architecture

This app exposes 3 MCP servers via Server-Sent Events (SSE) transport:

1. **Context7** - `/context7` - Library documentation lookup (2 tools)
2. **Perplexity** - `/perplexity` - AI-powered research (4 tools)
3. **BrightData** - `/brightdata` - Web scraping and SERP (4 tools)

**Total: 10 MCP tools**

## Endpoints

- `GET /health` - Health check
- `GET /context7` - Context7 MCP server (SSE)
- `GET /perplexity` - Perplexity MCP server (SSE)
- `GET /brightdata` - BrightData MCP server (SSE)

## Environment Variables

```bash
PORT=3000
CONTEXT7_API_KEY=your_key
PERPLEXITY_API_KEY=your_key
BRIGHTDATA_API_TOKEN=your_token
```

## Usage with Claude Agent SDK

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

const result = await query({
  prompt: 'Research TanStack Query v5',
  options: {
    mcpServers: {
      context7: {
        type: 'sse',
        url: 'http://mcp-servers:3000/context7'
      },
      perplexity: {
        type: 'sse',
        url: 'http://mcp-servers:3000/perplexity'
      },
      brightdata: {
        type: 'sse',
        url: 'http://mcp-servers:3000/brightdata'
      }
    }
  }
});
```

## Development

```bash
npm install
npm run dev  # Watch mode with tsx
```

## Production

```bash
npm run build
npm start
```

## Docker

```bash
docker build -t mcp-servers .
docker run -p 3000:3000 \
  -e CONTEXT7_API_KEY=xxx \
  -e PERPLEXITY_API_KEY=xxx \
  -e BRIGHTDATA_API_TOKEN=xxx \
  mcp-servers
```

## Benefits Over stdio

1. **No npx issues** - Direct HTTP connections
2. **Scalable** - Independent deployment and restart
3. **Debuggable** - HTTP requests visible and testable
4. **Clean separation** - Research agent just calls HTTP endpoints
5. **Language agnostic** - Any client can use HTTP/SSE
