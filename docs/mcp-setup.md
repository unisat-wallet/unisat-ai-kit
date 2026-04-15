# MCP Setup

UniSat AI remains the product name. The official repository is `unisat-ai`, and the current CLI-first architecture lives on the `main-next` branch.

## Local Start

```bash
git clone git@github.com:unisat-wallet/unisat-ai.git
cd unisat-ai
git checkout main-next
yarn mcp:server
```

The server currently runs over stdio and exposes five read-only tools:

- `search_docs`
- `find_openapi`
- `explain_api`
- `generate_snippet`
- `explain_error`

## Environment Overrides

If your knowledge-source repositories are not in the default sibling paths, override them before launch:

```bash
export UNISAT_DEV_DOCS_DIR=/absolute/path/to/unisat-dev-docs
export OPENAPI_SWAGGER_DIR=/absolute/path/to/openapi-swagger
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
        "OPENAPI_SWAGGER_DIR": "/Users/avani/workplace/github-repo/openapi-swagger"
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

`smoke` verifies:

- CLI `docs search`
- CLI `openapi explain`
- CLI `error explain`
- CLI `snippet generate`
- MCP `initialize`
- MCP `tools/list`
- MCP `tools/call`
