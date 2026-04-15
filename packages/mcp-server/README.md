# @unisat/ai-mcp-server

This package exposes CLI capabilities and read-only knowledge sources as standard MCP tools.

Install globally after publication:

```bash
npm install -g @unisat/ai-mcp-server
```

Or run it without a global install:

```bash
npx -y @unisat/ai-mcp-server
```

Initial tools:

- `search_docs`
- `find_openapi`
- `explain_api`
- `generate_snippet`
- `explain_error`

Run locally:

```bash
node bin/server.js
```

The current implementation is a minimal stdio MCP server. Tool results return both:

- `content`: serialized JSON text
- `structuredContent`: structured object payload
