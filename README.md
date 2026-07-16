# UniSat AI Kit

UniSat AI Kit provides a stdio MCP server and a command-line tool for agent-oriented UniSat OpenAPI discovery and calls.

## Register API Keys

Register API keys at https://developer.unisat.io/ before using UniSat OpenAPI calls.

Do not commit real API keys into repository files. Prefer user-level agent config or system environment variables for production use.

## MCP Quick Start

For Cursor, Claude, Codex, and other agents that support stdio MCP servers, the recommended public configuration is `npx`:

```json
{
  "mcpServers": {
    "unisat-ai-kit": {
      "command": "npx",
      "args": ["-y", "--registry=https://registry.npmjs.org/", "@unisat/openapi-mcp"],
      "env": {
        "UNISAT_BITCOIN_API_KEY": "YOUR_BITCOIN_API_KEY",
        "UNISAT_FRACTAL_API_KEY": "YOUR_FRACTAL_API_KEY"
      }
    }
  }
}
```

The explicit `--registry=https://registry.npmjs.org/` option avoids failures caused by stale npm mirrors or private registry configuration. The MCP server exposes `get_status`, `list_environments`, `resolve_api`, `show_api`, and `call_api`. Non-GET `call_api` calls require explicit user confirmation before execution. See `docs/mcp-setup.md` for full setup details.

## CLI Quick Start

Download the single-executable archive for your operating system. You do not need to install Node.js or npm. Replace `v0.1.4` with the latest release tag if needed.

After downloading the CLI, configure each OpenAPI environment separately:

```bash
npx -y @unisat/openapi-cli config bitcoin-key --api-key YOUR_BITCOIN_KEY
npx -y @unisat/openapi-cli config fractal-key --api-key YOUR_FRACTAL_KEY
```

These commands store keys in the current user's UniSat AI Kit config directory.

### macOS ARM64

```bash
curl -L -o unisat-openapi-cli-macos-arm64.tar.gz https://github.com/unisat-wallet/unisat-ai-kit/releases/download/v0.1.4/unisat-openapi-cli-macos-arm64.tar.gz
tar -xzf unisat-openapi-cli-macos-arm64.tar.gz
./unisat-openapi-cli --help
```

### Linux x64

```bash
curl -L -o unisat-openapi-cli-linux-x64.tar.gz https://github.com/unisat-wallet/unisat-ai-kit/releases/download/v0.1.4/unisat-openapi-cli-linux-x64.tar.gz
tar -xzf unisat-openapi-cli-linux-x64.tar.gz
./unisat-openapi-cli --help
```

### Linux ARM64

```bash
curl -L -o unisat-openapi-cli-linux-arm64.tar.gz https://github.com/unisat-wallet/unisat-ai-kit/releases/download/v0.1.4/unisat-openapi-cli-linux-arm64.tar.gz
tar -xzf unisat-openapi-cli-linux-arm64.tar.gz
./unisat-openapi-cli --help
```

### Windows x64

```powershell
Invoke-WebRequest -Uri "https://github.com/unisat-wallet/unisat-ai-kit/releases/download/v0.1.4/unisat-openapi-cli-windows-x64.zip" -OutFile "unisat-openapi-cli-windows-x64.zip"
Expand-Archive unisat-openapi-cli-windows-x64.zip -DestinationPath .
.\unisat-openapi-cli.exe --help
```

## Optional Global Installation

macOS / Linux:

```bash
sudo mv ./unisat-openapi-cli /usr/local/bin/unisat-openapi-cli
unisat-openapi-cli --help
```

Windows:

Add the extracted folder containing `unisat-openapi-cli.exe` to your system `PATH`.

## Use The CLI

```bash
unisat-openapi-cli --help
unisat-openapi-cli intro resolve --env bitcoin --query "get btc address balance" --format json
unisat-openapi-cli api call --env bitcoin --path "/v1/indexer/address/{address}/balance" --path-param address=YOUR_ADDRESS --format json
```

Supported command groups:

- `config bitcoin-key`
- `config fractal-key`
- `intro resolve`
- `intro show`
- `api call`

## Development

```bash
node scripts/doctor.mjs
node scripts/smoke.mjs
npm run package:cli
```

Useful package scripts:

- `npm run cli` runs the local CLI source.
- `npm run mcp:server` runs the local stdio MCP server.
- `npm run smoke` validates source CLI and MCP behavior.
- `npm run release:smoke` validates packed npm packages in a temporary install directory.
- `npm run package:cli` builds the current platform single-executable archive into `dist/single-cli`.
- `npm run package:cli:portable` builds the legacy multi-file portable package.
- `npm run package:mcp:portable` builds the MCP portable archive into `dist/portable-mcp`.

## Release Build

### CLI executable release

Build the current computer's package:

```bash
npm run package:cli
```

Build a specific platform package on matching host hardware:

```bash
npm run package:cli -- --target windows-x64
```

The GitHub Actions workflow `.github/workflows/cli-release.yml` builds platform archives on tag pushes like `v0.1.4` and uploads them to the GitHub Release. It can also be run manually from the GitHub Actions page via `workflow_dispatch`.

### MCP portable release

Build the current platform MCP portable archive:

```bash
npm run package:mcp:portable
```

The GitHub release workflow uploads MCP portable archives together with CLI executable archives.

### npm package release

Before publishing npm packages, verify source and packed-package behavior:

```bash
npm run smoke
npm run release:smoke
```

The workflow `.github/workflows/npm-release.yml` publishes the configured npm packages, currently documented for the package names `@unisat/openapi-cli` and `@unisat/openapi-mcp`. It runs on tag pushes like `v0.1.4` or manual `workflow_dispatch` and requires the `NPM_TOKEN` repository secret.

## Repository Layout

```text
packages/
  cli/
  mcp-server/
  shared-types/
scripts/
swagger/
```

- `packages/cli`: CLI command implementation.
- `packages/mcp-server`: MCP tools backed by the CLI capability layer.
- `swagger/`: local OpenAPI source and the data embedded into releases.
