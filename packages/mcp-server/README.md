# @unisat/openapi-mcp

This package exposes the supported UniSat AI Kit interface discovery capabilities as standard MCP tools.

Install globally after publication:

```bash
npm install -g @unisat/openapi-mcp
```

Or run it without a global install:

```bash
npx -y @unisat/openapi-mcp
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