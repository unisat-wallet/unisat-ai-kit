# @unisat/openapi-cli

This package owns the stable external CLI command surface for direct UniSat OpenAPI HTTPS calls.

Requires Node.js 18 or later and npm. Install globally:

```bash
npm install -g @unisat/openapi-cli
```

First query (replace the key placeholder locally):

```bash
unisat-openapi-cli config bitcoin-key --api-key YOUR_BITCOIN_API_KEY
unisat-openapi-cli config status --env bitcoin --format json
unisat-openapi-cli getBlockchainInfo --env bitcoin --format json
```

Obtain a key at https://developer.unisat.io/. Read the latest indexed height from `response.body.data.blocks`. Success requires exit code 0, `response.ok: true` and business `code: 0`; HTTP 200 alone is insufficient. No wallet or address is needed.

Supported commands include:

- `config bitcoin-key`
- `config fractal-key`
- `api call`
- `commands domains` and `commands --domain blockchain`
- Named API commands such as `getBlockchainInfo`
- `<command> --help` and `<command> --dry-run`

Use built-in discovery and per-command help to choose an API; no Agent Skill or source checkout is required. Domains are business categories, not networks. `commands --all` can produce very large output. Use text for discovery and JSON for structured results. Top-level `--help` explains quota lookup and safety limits.

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

Use `node bin/unisat-ai.js --help` for command usage.

API keys are stored in a user config `.env` file by the config commands. `api call` reads keys in this order: `--api-key`, process environment, user config `.env`.

## Website Download Package

The repository can also build single-executable CLI archives for users who do not have Node.js or npm installed:

```bash
npm run package:cli
```

Each archive contains:

- `unisat-openapi-cli.exe` on Windows, or `unisat-openapi-cli` on macOS/Linux
- bundled CLI code
- embedded OpenAPI swagger data

Users configure keys the same way:

```bash
unisat-openapi-cli config bitcoin-key --api-key YOUR_BITCOIN_KEY
unisat-openapi-cli config fractal-key --api-key YOUR_FRACTAL_KEY
```
