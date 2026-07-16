---
name: unisat-ai-kit-developer
description: Distribution skill for developers using the UniSat AI Kit CLI and MCP server. Use it when a developer wants installation or usage help for UniSat OpenAPI discovery or MCP integration.
---

# UniSat AI Kit Developer

## Use Cases

- Install the UniSat AI Kit CLI and MCP server
- Resolve UniSat OpenAPI interfaces from natural language
- Show OpenAPI path details, parameters, and runnable examples
- Connect UniSat AI Kit to Cursor, Codex, Claude, or another MCP runtime

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

# Use the CLI directly
unisat-openapi-cli intro resolve --query "address brc20 balance list" --format json
unisat-openapi-cli intro show --path "/v1/indexer/brc20/{ticker}/info" --format text
unisat-openapi-cli api call --path "/v1/indexer/brc20/status" --query-param start=0 --query-param limit=1 --format json

# Start the MCP server
unisat-openapi-mcp
```

## Working Rules

- Prefer the installed `unisat-openapi-cli` and `unisat-openapi-mcp` instead of re-implementing logic inside the skill.
- Current MCP tools are backed by repository-local OpenAPI swagger data.
- When the user asks how to configure MCP, run the install script first or print the config snippet it generates.
- When the user reports capability issues, run `doctor.sh` first.

## Boundaries

- This is a distribution skill, not a source of truth for product facts.
- If swagger data needs correction, fix it in the owning source and refresh this repository's `swagger/` data.
