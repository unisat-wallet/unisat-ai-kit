# MCP Setup

UniSat AI remains the product name. The official repository is `unisat-ai`, and the current CLI-first architecture lives on the `main-next` branch.

## Local Start

```bash
git clone git@github.com:unisat-wallet/unisat-ai.git
cd unisat-ai
git checkout main-next
yarn mcp:server
```

The server currently runs over stdio and exposes two read-only tools:\r\n\r\n- `resolve_api`\r\n- `show_api`\r\n\r\n## Environment Overrides

By default, OpenAPI data is read from the repository-local `swagger/` directory. If your docs repository is not in the default sibling path, or if you need to point OpenAPI loading at a different directory, override them before launch:

```bash
export UNISAT_DEV_DOCS_DIR=/absolute/path/to/unisat-dev-docs
export OPENAPI_SWAGGER_DIR=/absolute/path/to/custom-swagger-dir
yarn mcp:server
```

## Example MCP Config

Example stdio MCP configuration:

```json
{
  "mcpServers": {
    "unisat-ai": {
      "command": "node",
      "args": [
        "/absolute/path/to/unisat-ai/packages/mcp-server/bin/server.js"
      ],
      "env": {
        "UNISAT_DEV_DOCS_DIR": "/Users/avani/workplace/github-repo/unisat-dev-docs",
        "OPENAPI_SWAGGER_DIR": "/Users/avani/workplace/github-repo/unisat-ai/swagger"
      }
    }
  }
}
```

## Validation

After changing CLI or MCP behavior locally, run at least:

```bash
node scripts/doctor.mjs
node scripts/smoke.mjs
```

`smoke` verifies:\r\n\r\n- CLI `intro resolve`\r\n- CLI `intro show`\r\n- CLI `api call` missing-key handling\r\n- MCP `initialize`\r\n- MCP `tools/list`\r\n- MCP `tools/call`\r\n