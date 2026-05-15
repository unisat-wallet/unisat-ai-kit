# @unisat/ai-cli

This package owns the stable external CLI command surface.

Install globally after publication:

```bash
npm install -g @unisat/ai-cli
```

Initial commands:

- `docs search`
- `openapi explain`
- `snippet generate`
- `error explain`
- `api call`
- `intro resolve`
- `intro list`
- `intro show`
- `intro find`
- `intro params`
- `intro example`
- `intro domains`
- `intro related`
- `intro guide`
- `intro capabilities`
- `intro tasks`
- `intro task`

Current runnable examples:

```bash
node bin/unisat-ai.js intro resolve --query "address brc20 balance list" --format text
node bin/unisat-ai.js docs search --query "api key" --format text
node bin/unisat-ai.js openapi explain --path "/v1/indexer/brc20/status" --format json
node bin/unisat-ai.js error explain --code -154 --format text
node bin/unisat-ai.js snippet generate --path "/v1/indexer/brc20/status" --language curl --format text
node bin/unisat-ai.js api call --path "/v1/indexer/brc20/status" --query-param start=0 --query-param limit=1 --format json
node bin/unisat-ai.js intro guide --format text
node bin/unisat-ai.js intro task --name "get-address-runes-balances" --format text
```
