# UniSat CLI

Command-line tool for discovering and calling UniSat OpenAPI interfaces.

## Quick Start

Download the single-executable archive for your operating system. You do not need to install Node.js or npm.

### macOS ARM64

```bash
curl -L -o unisat-cli-macos-arm64.tar.gz https://github.com/unisat-wallet/unisat-ai/releases/download/v0.1.4/unisat-cli-macos-arm64.tar.gz
tar -xzf unisat-cli-macos-arm64.tar.gz
./unisat-cli --help
```

### Linux x64

```bash
curl -L -o unisat-cli-linux-x64.tar.gz https://github.com/unisat-wallet/unisat-ai/releases/download/v0.1.4/unisat-cli-linux-x64.tar.gz
tar -xzf unisat-cli-linux-x64.tar.gz
./unisat-cli --help
```

### Linux ARM64

```bash
curl -L -o unisat-cli-linux-arm64.tar.gz https://github.com/unisat-wallet/unisat-ai/releases/download/v0.1.4/unisat-cli-linux-arm64.tar.gz
tar -xzf unisat-cli-linux-arm64.tar.gz
./unisat-cli --help
```

### Windows x64

```powershell
Invoke-WebRequest -Uri "https://github.com/unisat-wallet/unisat-ai/releases/download/v0.1.4/unisat-cli-windows-x64.zip" -OutFile "unisat-cli-windows-x64.zip"
Expand-Archive unisat-cli-windows-x64.zip -DestinationPath .
.\unisat-cli.exe --help
```

## Optional Global Installation

macOS / Linux:

```bash
sudo mv ./unisat-cli /usr/local/bin/unisat-cli
unisat-cli --help
```

Windows:

Add the extracted `unisat-cli-windows-x64` folder containing `unisat-cli.exe` to your system `PATH`.

## Configure API Keys

Register an API key at https://developer.unisat.io/, then configure each OpenAPI environment separately:

```bash
unisat-cli config bitcoin-key --api-key YOUR_BITCOIN_KEY
unisat-cli config fractal-key --api-key YOUR_FRACTAL_KEY
```

## Use The CLI

```bash
unisat-cli --help
unisat-cli intro resolve --env bitcoin --query "get btc address balance" --format json
unisat-cli api call --env bitcoin --path "/v1/indexer/address/{address}/balance" --path-param address=YOUR_ADDRESS --format json
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
- `npm run smoke` validates CLI and MCP behavior.
- `npm run package:cli` builds the current platform single-executable archive into `dist/single-cli`.
- `npm run package:cli:portable` builds the legacy multi-file portable package.

## Release Build

Build the current computer's package:

```bash
npm run package:cli
```

Build a specific platform package on matching host hardware:

```bash
npm run package:cli -- --target windows-x64
```

The GitHub Actions workflow `.github/workflows/cli-release.yml` builds all platform archives on tag pushes like `v0.1.4` and uploads them to the GitHub Release. It can also be run manually from the GitHub Actions page via `workflow_dispatch`.

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
- `swagger/`: local OpenAPI source and the data embedded into single-executable releases.
