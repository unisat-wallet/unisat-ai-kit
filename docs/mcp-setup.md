# MCP Setup

UniSat AI Kit provides a stdio MCP server. Public users should configure an installed command, not a local source path.

The MCP server exposes `get_status` and exact-path `call_api`. Interface discovery and interface matching are handled by the UniSat OpenAPI Agent Skill.

## Option A: npx configuration

This is the recommended setup for Cursor, Claude, Codex, and other agents that support MCP command + args configuration.

```json
{
  "mcpServers": {
    "unisat-ai": {
      "command": "npx",
      "args": ["-y", "@api-agent-test/ai-mcp"]
    }
  }
}
```

The package includes the MCP server and depends on `@api-agent-test/ai-cli`, whose npm package bundles the OpenAPI swagger data used for status reporting and CLI calls.

## Option B: global npm install

Install once:

```bash
npm install -g @api-agent-test/ai-mcp
```

Configure the agent:

```json
{
  "mcpServers": {
    "unisat-ai": {
      "command": "unisat-openapi-mcp"
    }
  }
}
```

## Option C: GitHub Release portable package

Download and extract the portable MCP package for your platform from GitHub Releases.

macOS/Linux configuration:

```json
{
  "mcpServers": {
    "unisat-ai": {
      "command": "/absolute/path/to/unisat-openapi-mcp"
    }
  }
}
```

Windows configuration:

```json
{
  "mcpServers": {
    "unisat-ai": {
      "command": "C:/absolute/path/to/unisat-openapi-mcp.cmd"
    }
  }
}
```

Use an absolute path to the extracted launcher. The portable archive contains production dependencies and bundled swagger data.

## Option D: local source development

For repository development only:

```bash
npm install
npm run mcp:server
```

Local source MCP config:

```json
{
  "mcpServers": {
    "unisat-ai": {
      "command": "node",
      "args": ["/absolute/path/to/unisat-ai-kit/packages/mcp-server/bin/server.js"]
    }
  }
}
```

## Tools

The MCP server exposes:

- `get_status`: returns MCP version, Node.js version, CLI caller capability status, swagger source, and available tools.

## API keys

OpenAPI calls require environment-specific API keys. Register at https://developer.unisat.io/ and configure one of these environment variables in the agent process environment:

```bash
UNISAT_BITCOIN_API_KEY=YOUR_BITCOIN_KEY
UNISAT_FRACTAL_API_KEY=YOUR_FRACTAL_KEY
```

You can also configure keys with the CLI package:

```bash
npx -y @api-agent-test/ai-cli config bitcoin-key --api-key YOUR_BITCOIN_KEY
npx -y @api-agent-test/ai-cli config fractal-key --api-key YOUR_FRACTAL_KEY
```

The MCP server does not expose an environment listing or API call tool. Use `get_status` for package diagnostics, and use `unisat-openapi-cli api call` for exact-path calls.

## Optional environment overrides

The public npm and portable packages already include swagger data. Override the swagger directory only for development or custom builds:

```bash
OPENAPI_SWAGGER_DIR=/absolute/path/to/swagger npx -y @api-agent-test/ai-mcp
```

## Validation

Local maintainers should verify three scenarios before release:

```bash
npm run smoke
npm run release:smoke
```

The smoke checks cover MCP `initialize`, `tools/list`, and `tools/call` for `get_status` only.
