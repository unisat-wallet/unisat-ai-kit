---
name: unisat-ai-kit-developer
description: Distribution skill for developers using the UniSat AI Kit CLI and MCP server. Use it when a developer wants installation or usage help for exact-path UniSat OpenAPI calls or MCP integration.
---

# UniSat AI Kit Developer

## Use Cases

- Install the UniSat AI Kit CLI and MCP server
- Configure API keys for Bitcoin and Fractal OpenAPI environments
- Call exact UniSat OpenAPI paths through the CLI
- Connect the MCP server to Cursor, Codex, Claude, or another MCP runtime

## Install Priority

When the user asks to install, configure, set up, or integrate UniSat AI Kit locally, run:

```bash
bash skills/unisat-ai-developer/scripts/install.sh
```

The install script handles:

- Skill installation into `~/.codex/skills`, `~/.claude/skills`, and `~/.cc-switch/skills`
- Local command installation into `~/.local/bin`
  - `unisat-openapi-cli`
  - `unisat-openapi-mcp`
- Printing an MCP config snippet

## Common Commands

```bash
# Install
bash skills/unisat-ai-developer/scripts/install.sh

# Doctor
bash skills/unisat-ai-developer/scripts/doctor.sh

# Use the CLI directly with an exact OpenAPI path
unisat-openapi-cli config bitcoin-key --api-key YOUR_BITCOIN_KEY
unisat-openapi-cli api call --path "/v1/indexer/brc20/status" --query-param start=0 --query-param limit=1 --format json

# Start the MCP server
unisat-openapi-mcp
```

## Working Rules

- Prefer the installed `unisat-openapi-cli` and `unisat-openapi-mcp` instead of re-implementing logic inside the skill.
- The CLI only executes exact OpenAPI paths. It does not resolve natural language, recommend interfaces, or show interface details.
- The MCP server exposes `get_status` and exact-path `call_api`.
- Current CLI calls are backed by repository-local or bundled OpenAPI swagger data.
- When the user asks how to configure MCP, run the install script first or print the config snippet it generates.
- When the user reports capability issues, run `doctor.sh` first.

## Boundaries

- This is a distribution skill, not a source of truth for product facts.
- If swagger data needs correction, fix it in the owning source and refresh this repository's `swagger/` data.
