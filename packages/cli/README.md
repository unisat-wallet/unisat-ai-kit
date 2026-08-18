# @unisat/openapi-cli

This package owns the stable external CLI command surface for direct UniSat OpenAPI HTTPS calls.

Install globally after publication:

```bash
npm install -g @unisat/openapi-cli
```

Supported commands:

- `config bitcoin-key`
- `config fractal-key`
- `api call`

The CLI intentionally does not discover, match, recommend, or explain OpenAPI interfaces. Agents should inspect `swagger/*.yaml` or use the UniSat OpenAPI Agent Skill to choose an exact path before calling the CLI.

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
