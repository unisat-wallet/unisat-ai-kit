# @api-agent-test/ai-cli

This package owns the stable external CLI command surface for direct UniSat OpenAPI HTTPS calls.

Install globally after publication:

```bash
npm install -g @api-agent-test/ai-cli
```

Supported commands:

- `commands`
- `config bitcoin-key`
- `config fractal-key`
- `swagger status`
- `swagger refresh`
- `api call`
- `<api-command>` generated from an OpenAPI `operationId`

The CLI does not match natural language to interfaces or recommend APIs. Agents can run `commands --format json`, inspect the cached Swagger YAML, or use the UniSat OpenAPI Agent Skill to select a generated command or exact path.

Environments:

- `bitcoin` -> `https://open-api.unisat.io` -> `UNISAT_BITCOIN_API_KEY`
- `fractal` -> `https://open-api-fractal.unisat.io` -> `UNISAT_FRACTAL_API_KEY`

Recommended CLI flow:

```bash
node bin/unisat-ai.js config bitcoin-key --api-key YOUR_BITCOIN_KEY
node bin/unisat-ai.js api call --env bitcoin --path "/v1/indexer/address/{address}/balance" --path-param address=YOUR_ADDRESS --format json
```

Fractal example:

```bash
node bin/unisat-ai.js config fractal-key --api-key YOUR_FRACTAL_KEY
node bin/unisat-ai.js api call --env fractal --path "/v1/public/fractal/supply" --format json
```

Use `node bin/unisat-ai.js --help` for agent-oriented workflow notes and command usage. Swagger is downloaded from the `unisat-dev-docs` manifest on first use, cached locally, and checked for updates after its cache TTL expires.

Inspect or manually refresh the cache:

```bash
unisat-openapi-cli swagger status
unisat-openapi-cli swagger refresh
unisat-openapi-cli swagger refresh --force
```

API keys are stored in a user config `.env` file by the config commands. `api call` reads keys in this order: `--api-key`, process environment, user config `.env`.

## Website Download Package

The repository can also build single-executable CLI archives for users who do not have Node.js or npm installed:

```bash
npm run package:cli
```

Each archive contains:

- `unisat-openapi-cli.exe` on Windows, or `unisat-openapi-cli` on macOS/Linux
- bundled CLI code
- runtime Swagger download and local cache support

Users configure keys the same way:

```bash
unisat-openapi-cli config bitcoin-key --api-key YOUR_BITCOIN_KEY
unisat-openapi-cli config fractal-key --api-key YOUR_FRACTAL_KEY
```
