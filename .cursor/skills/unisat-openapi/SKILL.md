---
name: unisat-openapi
description: Guides agents to inspect UniSat OpenAPI swagger YAML files, apply UniSat API business rules, choose exact OpenAPI paths, and call them through MCP or CLI. Use when the user asks for UniSat API interfaces, UniSat OpenAPI calls, BRC-20, Runes, Alkanes, inscriptions, marketplace, Fractal, or address/blockchain data.
---

# UniSat OpenAPI

## Core Rule

Do not use natural-language interface matching tools. This project intentionally exposes no planner. You must inspect `swagger/*.yaml`, choose an exact OpenAPI path, and call it with MCP `call_api` or `unisat-openapi-cli api call` only when execution is requested and safe.

## Workflow

1. Identify the likely swagger file by domain:
   - Blockchain, fees, blocks, txs, address BTC data: `swagger/blockchain-indexer.yaml`
   - Classic BRC-20: `swagger/brc20-indexer.yaml`
   - BRC20-Prog: `swagger/brc20-prog-api.yaml`
   - BRC20 Swap / InSwap: `swagger/brc20-swap.yaml`
   - Inscriptions: `swagger/inscription-indexer.yaml`
   - Inscribe orders: `swagger/inscribe.yaml`
   - Runes indexer: `swagger/runes-indexer.yaml`
   - Runes marketplace: `swagger/runes-marketplace.yaml`
   - Alkanes indexer: `swagger/alkanes-indexer.yaml`
   - Alkanes marketplace: `swagger/alkanes-marketplace.yaml`
   - Collections: `swagger/collection-indexer.yaml` or `swagger/collection-marketplace.yaml`
   - Domains: `swagger/domain-marketplace.yaml`
   - Fractal public stats: `swagger/fractal.yaml`
2. Read the relevant path block and confirm:
   - exact OpenAPI path
   - method
   - environment
   - required path/query/body parameters
   - side effects and confirmation needs
3. If the user only asked to find an interface, return the exact path, method, file, required params, and why it matches.
4. If the user asked to execute a call:
   - ask for missing required parameters
   - ask explicit confirmation before non-GET or state-changing operations
   - use MCP `call_api` or `unisat-openapi-cli api call --path <exact-path>` with path/query/body parameters

## Hidden Business Rules

- BRC20-Prog ticker must be 6 characters and is Bitcoin-only.
- Classic BRC-20 tickers such as `ordi` should use `/v1/indexer/brc20/*`, especially `/v1/indexer/brc20/{ticker}/info` for token info.
- InSwap and BRC20 Swap are equivalent product names. Use `/v1/brc20-swap/*` paths for InSwap requests.
- BRC20 Swap / InSwap APIs are Fractal-only.
- `/v1/indexer/inscription/info/{inscriptionId}` accepts either an inscription id or an inscription number in the `inscriptionId` path parameter.
- `swagger/cat20-dex.yaml` is intentionally absent because CAT20 DEX is deprecated/offline.

## CLI Examples

```bash
unisat-openapi-cli config bitcoin-key --api-key YOUR_BITCOIN_KEY
unisat-openapi-cli api call --env bitcoin --path "/v1/indexer/fees/recommended" --format json
unisat-openapi-cli api call --env bitcoin --path "/v1/indexer/brc20/{ticker}/info" --path-param ticker=ordi --format json
unisat-openapi-cli api call --env fractal --path "/v1/public/fractal/supply" --format json
```

## Safety

- GET requests are normally read-only.
- POST, PUT, PATCH, DELETE, broadcast, order creation, swap submission, add/remove liquidity, withdraw, deposit confirmation, and transaction push operations require explicit user confirmation before execution.
- If the user asks only to identify an interface, do not call the API.
