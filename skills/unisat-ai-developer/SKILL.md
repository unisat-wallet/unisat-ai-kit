---
name: unisat-ai-developer
description: Distribution skill for developers using the UniSat AI assistant. Use it when a developer wants installation or usage help for docs Q&A, OpenAPI explanation, error explanation, snippet generation, or MCP integration. Prefer the bundled install and doctor scripts to wire skill, CLI, and MCP together.
---

# UniSat AI Developer

## Use Cases

- Install UniSat AI skill, CLI, and MCP in one pass
- Query UniSat developer documentation
- Explain OpenAPI paths, parameters, and usage
- Generate `curl` or `typescript fetch` examples
- Explain known error codes
- Connect UniSat AI to Codex, Claude, or another MCP runtime

## Install Priority

When the user is using this skill for the first time, or explicitly asks to install, configure, set up, or integrate UniSat AI, run:

```bash
bash skills/unisat-ai-developer/scripts/install.sh
```

The install script handles:

- Skill installation into `~/.codex/skills`, `~/.claude/skills`, and `~/.cc-switch/skills`
- Local command installation into `~/.local/bin`
  - `unisat-ai-cli`
  - `unisat-ai-mcp-server`
- Printing the MCP config snippet

## Common Commands

```bash
# Install
bash skills/unisat-ai-developer/scripts/install.sh

# Doctor
bash skills/unisat-ai-developer/scripts/doctor.sh

# Use the CLI directly
unisat-ai-cli intro resolve --query "address brc20 balance list" --format json\r\nunisat-ai-cli intro show --path "/v1/indexer/brc20/{ticker}/info" --format text\r\nunisat-ai-cli api call --path "/v1/indexer/brc20/status" --query-param start=0 --query-param limit=1 --format json

# Start the MCP server
unisat-ai-mcp-server
```

## Working Rules

- Prefer the installed `unisat-ai-cli` and `unisat-ai-mcp-server` instead of re-implementing logic inside the skill
- Docs, OpenAPI, and error-code facts come from upstream owners and should not be duplicated here
- When the user asks how to configure MCP, run the install script first or print the config snippet it generates
- When the user reports capability issues, run `doctor.sh` first

## Boundaries

- This is a distribution skill, not a source of truth for product facts
- If docs, swagger, or the error catalog itself need correction, fix them in the owning repository
