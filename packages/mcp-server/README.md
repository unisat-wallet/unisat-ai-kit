# @unisat/openapi-mcp

This package exposes the UniSat AI Kit MCP server.

Install globally after publication:

```bash
npm install -g @unisat/openapi-mcp
```

Or run it without a global install:

```bash
npx -y @unisat/openapi-mcp
```

## Tools

- `get_status`: return server, CLI, swagger, and config status.
- `call_api`: call an exact UniSat OpenAPI path.

The MCP server does not expose interface discovery or interface matching. Agents should use the UniSat OpenAPI Agent Skill to inspect `swagger/*.yaml` and choose an exact OpenAPI path before calling `call_api`.

## Result format

Tool results return both:

- `content`: serialized JSON text.
- `structuredContent`: structured object payload.

## Local development

```bash
node bin/server.js
```
