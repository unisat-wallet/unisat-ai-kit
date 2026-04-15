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

Current runnable examples:

```bash
node bin/unisat-ai.js docs search --query "api key" --format text
node bin/unisat-ai.js openapi explain --path "/v1/indexer/brc20/status" --format json
node bin/unisat-ai.js error explain --code -154 --format text
node bin/unisat-ai.js snippet generate --path "/v1/indexer/brc20/status" --language curl --format text
```
