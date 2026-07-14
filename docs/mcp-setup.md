# MCP Setup

UniSat AI provides a stdio MCP server for UniSat OpenAPI discovery and calls. Public users should configure an installed command, not a local source path.

## Option A: npx configuration

This is the recommended setup for Cursor, Claude, Codex, and other agents that support MCP command + args configuration.

```json
{
  "mcpServers": {
    "unisat-ai": {
      "command": "npx",
      "args": ["-y", "@unisat/ai-mcp-server"]
    }
  }
}
```

The package includes the MCP server and depends on `@unisat/ai-cli`, whose npm package bundles the OpenAPI swagger data required by the tools.

## Option B: global npm install

Install once:

```bash
npm install -g @unisat/ai-mcp-server
```

Configure the agent:

```json
{
  "mcpServers": {
    "unisat-ai": {
      "command": "unisat-ai-mcp-server"
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
      "command": "/absolute/path/to/unisat-ai-mcp-server"
    }
  }
}
```

Windows configuration:

```json
{
  "mcpServers": {
    "unisat-ai": {
      "command": "C:/absolute/path/to/unisat-ai-mcp-server.cmd"
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
      "args": ["/absolute/path/to/unisat-ai/packages/mcp-server/bin/server.js"]
    }
  }
}
```

## Tools

The MCP server exposes:

- `get_status`: returns MCP version, Node.js version, CLI capability status, swagger source, and available tools.
- `list_environments`: lists `bitcoin` and `fractal` OpenAPI environments, base URLs, API key environment names, and whether keys are configured.
- `resolve_api`: resolves a natural-language task or exact path to a UniSat OpenAPI interface.
- `show_api`: shows raw OpenAPI detail for an exact path.
- `call_api`: calls a UniSat OpenAPI interface through the CLI capability layer. `GET` calls run directly; non-GET calls first return `confirmation_required` and must be retried with `confirm: true` after the user explicitly confirms.

## API keys

OpenAPI calls require environment-specific API keys. Register at https://developer.unisat.io/ and configure one of these environment variables in the agent process environment:

```bash
UNISAT_BITCOIN_API_KEY=YOUR_BITCOIN_KEY
UNISAT_FRACTAL_API_KEY=YOUR_FRACTAL_KEY
```

You can also configure keys with the CLI package:

```bash
npx -y @unisat/ai-cli config bitcoin-key --api-key YOUR_BITCOIN_KEY
npx -y @unisat/ai-cli config fractal-key --api-key YOUR_FRACTAL_KEY
```

The MCP `list_environments` tool reports whether each key is configured.

## Optional environment overrides

The public npm and portable packages already include swagger data. Override the swagger directory only for development or custom builds:

```bash
OPENAPI_SWAGGER_DIR=/absolute/path/to/swagger npx -y @unisat/ai-mcp-server
```

## Validation

Local maintainers should verify three scenarios before release:

```bash
npm run smoke
npm run release:smoke
```

The smoke checks cover MCP `initialize`, `tools/list`, and `tools/call` for `resolve_api`, `show_api`, `get_status`, `list_environments`, and a no-network `call_api` not-found case.
