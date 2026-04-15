# UniSat AI

UniSat AI is the foundation repository for developer assistant capabilities. The official repository name remains `unisat-ai`, and the current CLI-first architecture lives on the `main-next` branch.

- `packages/cli`: stable CLI capability layer
- `packages/mcp-server`: MCP layer exposing CLI capabilities and read-only knowledge sources
- `packages/shared-types`: shared structured contracts across CLI and MCP
- `skills/unisat-ai-developer`: installable distribution skill for developer use

Current priorities:

- Primary audience: developer platform and external developers
- First capability set: docs Q&A, OpenAPI explanation, snippet generation, and error troubleshooting
- Technical order: stabilize CLI first, expose MCP second, then let skills and agents consume it

## Repo Layout

```text
packages/
  cli/
  mcp-server/
  shared-types/
docs/
  architecture.md
  roadmap-90d.md
scripts/
  doctor.mjs
```

Current branch roles:

- `master`: preserves the historical monorepo structure
- `main-next`: carries the current CLI / MCP / skill architecture

## Current Boundaries

- Docs, OpenAPI, SDKs, and error catalogs remain upstream sources of truth and should not be duplicated here
- `openapi-swagger` still owns the public OpenAPI definitions
- `unisat-dev-docs` still owns developer docs, the site, and SDK artifacts
- `sloth-workspace` still owns internal playbooks and agent orchestration

## Local Commands

```bash
node scripts/doctor.mjs
node scripts/smoke.mjs
yarn mcp:server
bash scripts/install-developer-skill.sh
```

## Developer Install

If the goal is to let a developer install the skill and get UniSat AI skill, CLI, and MCP wired up in one step, run:

```bash
bash scripts/install-developer-skill.sh
```

The install script will:

- Install the distribution skill into `~/.codex/skills`, `~/.claude/skills`, and `~/.cc-switch/skills`
- Install two local launchers into `~/.local/bin`
  - `unisat-ai-cli`
  - `unisat-ai-mcp-server`
- Print a ready-to-copy MCP config snippet

## Near-term Plan

1. Finalize the initial command surface: `docs search`, `openapi explain`, `snippet generate`, `error explain`
2. Keep improving the MCP server so CLI outputs map cleanly to tool results
3. Dogfood the flow through internal agents and developer-facing entry points
