# @unisat/openapi-mcp

This package exposes the UniSat AI Kit MCP server.

Requires Node.js 18 or later and npm. Install globally:

```bash
npm install -g @unisat/openapi-mcp
```

Or run it without a global install:

```bash
npx -y @unisat/openapi-mcp
```

## Tools

- `get_status`: return server, CLI, swagger, and config status.
- `list_operations`: discover interfaces by query/domain with bounded pagination.
- `get_operation`: inspect parameters and safety metadata.
- `call_api`: call an exact UniSat OpenAPI path.

Use the built-in discovery tools before `call_api`; an Agent Skill is not required. Configure this command as a stdio MCP server in your agent client. Obtain a key at https://developer.unisat.io/ and supply `UNISAT_BITCOIN_API_KEY` in the server process environment. See the [setup guide](https://github.com/unisat-wallet/unisat-ai-kit/blob/main/docs/mcp-setup.md) for configuration examples.

## First test: latest Bitcoin block height

Ask your agent to discover the blockchain info interface, inspect it, and call it read-only. The `call_api` arguments are:

```json
{
  "path": "/v1/indexer/blockchain/info",
  "environment": "bitcoin"
}
```

Read `structuredContent.response.body.data.blocks`. Check `isError`, `response.ok` and the business code before treating the call as successful. No address, wallet or confirmation is needed. For Fractal, configure `UNISAT_FRACTAL_API_KEY` separately and use `environment: "fractal"`; both networks are mainnets.

## Result format

Tool results return both:

- `content`: serialized JSON text.
- `structuredContent`: structured object payload.

## Local development

```bash
node bin/server.js
```
