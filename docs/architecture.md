# Architecture

## Three Layers

### CLI Layer

- Defines stable commands, arguments, and JSON output
- Handles retrieval, rule composition, and structured results
- Does not own long-running conversation state

### MCP Layer

- Wraps CLI capabilities and read-only knowledge sources as standard tools
- Tool results should consistently include `answer`, `refs`, and `structured_data`
- Targets model consumption without coupling to a specific UI

### Orchestration Layer

- Owned by external agents, skills, or product UIs
- Handles task decomposition, context assembly, response formatting, and fallbacks
- Must not become a source of truth itself

## Initial Capability Domains

- `docs/search`
- `openapi/explain`
- `snippet/generate`
- `error/explain`

## Source Ownership

- `openapi-swagger`: public OpenAPI source of truth
- `unisat-dev-docs`: developer docs, site, and SDK outputs
- `unisat-ai` on `main-next`: AI capability packaging, retrieval, tool contracts, evaluation, and consumption interfaces
