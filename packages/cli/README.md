# @unisat/ai-cli

This package owns the stable external CLI command surface for agent-oriented UniSat API discovery and calls.

Install globally after publication:

```bash
npm install -g @unisat/ai-cli
```

Supported commands:

- `config bitcoin-key`
- `config fractal-key`
- `intro resolve`
- `intro show`
- `api call`

Environments:

- `bitcoin` -> `https://open-api.unisat.io` -> `UNISAT_BITCOIN_API_KEY`
- `fractal` -> `https://open-api-fractal.unisat.io` -> `UNISAT_FRACTAL_API_KEY`

Recommended flow:

```bash
node bi./unisat-cli.js config bitcoin-key --api-key YOUR_BITCOIN_KEY
node bi./unisat-cli.js intro resolve --env bitcoin --query "address brc20 balance list" --format json
node bi./unisat-cli.js api call --env bitcoin --path "/v1/indexer/address/{address}/balance" --path-param address=YOUR_ADDRESS --format json
```

Fractal example:

```bash
node bi./unisat-cli.js config fractal-key --api-key YOUR_FRACTAL_KEY
node bi./unisat-cli.js intro resolve --env fractal --query "get fractal address balance" --format json
node bi./unisat-cli.js api call --env fractal --path "/v1/public/fractal/supply" --format json
```

Use `node bi./unisat-cli.js --help` for agent-oriented workflow notes and command usage.

API keys are stored in a user config `.env` file by the config commands. `api call` reads keys in this order: `--api-key`, process environment, user config `.env`.

## Website Download Package

The repository can also build single-executable CLI archives for users who do not have Node.js or npm installed:

```bash
npm run package:cli
```

Each archive contains:

- `unisat-cli.exe` on Windows, or `unisat-ai` on macOS/Linux
- bundled CLI code
- embedded OpenAPI swagger data

Users configure keys the same way:

```bash
unisat-cli config bitcoin-key --api-key YOUR_BITCOIN_KEY
unisat-cli config fractal-key --api-key YOUR_FRACTAL_KEY
```

