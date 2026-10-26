# UniSat AI Kit

UniSat AI Kit provides a CLI and stdio MCP server for AI agents to discover and call UniSat OpenAPI. Query blockchain data, address assets, inscriptions, BRC-20 and marketplace data, or build applications using these APIs.

## Before you start

- npm/npx installation requires Node.js 18 or later and npm. The standalone CLI executable does not require Node.js.
- Obtain a Bitcoin API key at [UniSat Developer Center](https://developer.unisat.io/) for the examples below.
- Bitcoin and Fractal mainnets are supported, with separate keys and API permissions.
- API keys grant service access, not wallet signing authority. Do not provide private keys or seed phrases.
- API definitions are downloaded from dev-docs on demand and cached locally; the first API discovery requires network access.

## CLI quick start

### 1. Install

```bash
npm install -g @api-agent-test/ai-cli --registry=https://registry.npmjs.org/
```

Alternatively, extract the CLI archive for your OS and CPU from [GitHub Releases](https://github.com/unisat-wallet/unisat-ai-kit/releases). Use the corresponding command prefix below:

| Installation | Command prefix |
| --- | --- |
| Global npm installation, or executable on PATH | `unisat-openapi-cli` |
| Extracted macOS/Linux executable | `./unisat-openapi-cli` |
| Extracted Windows executable (PowerShell) | `.\unisat-openapi-cli.exe` |

Add the executable directory to PATH to use `unisat-openapi-cli` from any terminal or agent.

View the available commands:

```bash
unisat-openapi-cli --help
```

### 2. Configure API keys

Replace the placeholder with your key and run locally:

```bash
unisat-openapi-cli config bitcoin-key --api-key YOUR_BITCOIN_API_KEY
```

For Fractal:

```bash
unisat-openapi-cli config fractal-key --api-key YOUR_FRACTAL_API_KEY
```

Configure only the networks you need. Keys are saved in your user config. Alternatively, set `UNISAT_BITCOIN_API_KEY` and `UNISAT_FRACTAL_API_KEY` in the environment.

### 3. Query the latest block height

```bash
unisat-openapi-cli getBlockchainInfo --env bitcoin --format json
```

With the CLI on PATH and the key configured, ask an agent with terminal access:

> Use unisat-openapi-cli to get the latest Bitcoin block height.

For more commands and usage details, run `unisat-openapi-cli --help`.

## MCP quick start

Add this stdio MCP server to your agent client (configuration format may vary by client):

```json
{
  "mcpServers": {
    "unisat-ai": {
      "command": "npx",
      "args": ["-y", "--registry=https://registry.npmjs.org/", "@api-agent-test/ai-mcp"],
      "env": {
        "UNISAT_BITCOIN_API_KEY": "YOUR_BITCOIN_API_KEY",
        "UNISAT_FRACTAL_API_KEY": "YOUR_FRACTAL_API_KEY"
      }
    }
  }
}
```

Replace the key placeholders for the networks you use, remove unused entries, and reconnect the server. The first launch downloads the package from npm.

Ask your agent:

> Use UniSat MCP to get the latest Bitcoin block height.

See [MCP setup](docs/mcp-setup.md) for alternative installation methods.

## Development

From a source checkout:

```bash
npm install
npm run cli -- --help
npm run test:agent
npm run smoke
npm run release:smoke
```

- `npm run mcp:server`: start the local MCP server.
- `npm run package:cli`: build the current platform's standalone CLI archive.
- `npm run package:mcp:portable`: build the MCP portable archive.

Release automation: [CLI/MCP archives](.github/workflows/cli-release.yml) and [npm packages](.github/workflows/npm-release.yml). See [architecture](docs/architecture.md) and the [agent regression plan](tests/agent-regression/README.md) for development details.
