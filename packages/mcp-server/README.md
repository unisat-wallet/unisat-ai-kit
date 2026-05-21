# @unisat/ai-mcp-server

This package exposes the supported UniSat AI interface discovery capabilities as standard MCP tools.

Install globally after publication:

```bash
npm install -g @unisat/ai-mcp-server
```

Or run it without a global install:

```bash
npx -y @unisat/ai-mcp-server
```

Tools:

- `resolve_api`
- `show_api`

Run locally:

```bash
node bin/server.js
```

The current implementation is a minimal stdio MCP server. Tool results return both:

- `content`: serialized JSON text
- `structuredContent`: structured object payload