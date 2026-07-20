# @api-agent-test/ai-mcp

This package exposes UniSat AI Kit capabilities as standard MCP tools for AI agents.

Install globally after publication:

```bash
npm install -g @api-agent-test/ai-mcp
```

Or run it without a global install:

```bash
npx -y @api-agent-test/ai-mcp
```

## Tools

- `get_status`: return server, CLI, swagger, and config status.
- `list_environments`: list supported OpenAPI environments and API key configuration status.
- `resolve_api`: single Agent-facing API planner entry point.
- `show_api`: show raw OpenAPI detail for a known path.
- `call_api`: execute a known OpenAPI path. Non-GET calls require explicit confirmation.

## Agent-facing planning protocol

`resolve_api` is designed for agents, not for direct multilingual user search. Agents must provide explicit English structured fields (`intent`, `action`, `resource`) or an exact `path`; free-form natural-language query matching is intentionally unsupported.

Recommended agent flow:

1. Convert the user request into explicit English structured fields.
2. Call `resolve_api` once with `intent`, `action`, `resource`, `environment`, `entities`, and `preferences`, or with an exact `path`.
3. Inspect the returned `mode`, `selected`, `bindings`, `safety`, and `nextAction`.
4. If `mode=planned` and `safety.executable=true`, call `call_api` with the selected path and bindings.
5. If `mode=missing_required_entities`, ask the user for the missing data.
6. If `mode=confirmation_required`, ask the user for explicit confirmation before calling a non-GET API with `confirm=true`.

Example read-only planning request:

```json
{
  "intent": "read.address.availableUtxos",
  "action": "read",
  "resource": "availableUtxos",
  "environment": "bitcoin",
  "entities": {
    "address": "bc1..."
  },
  "preferences": {
    "readOnlyOnly": true,
    "maxAlternatives": 5
  }
}
```

Example planning response shape:

```json
{
  "mode": "planned",
  "selected": {
    "method": "GET",
    "path": "/v1/indexer/address/{address}/available-utxo-data"
  },
  "bindings": {
    "pathParams": {
      "address": "bc1..."
    },
    "queryParams": {
      "cursor": 0,
      "size": 20
    }
  },
  "safety": {
    "sideEffect": "none",
    "requiresConfirmation": false,
    "executable": true
  },
  "nextAction": "call_api"
}
```

## Result format

Tool results return both:

- `content`: serialized JSON text.
- `structuredContent`: structured object payload.

## Local development

```bash
node bin/server.js
```
