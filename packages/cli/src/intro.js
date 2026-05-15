const path = require("path");
const { buildRequestPlan } = require("./openapi-request");
const {
  collectPathBlocks,
  extractMethods,
  extractScalar,
  extractTags,
  getOpenApiDetail,
  getSwaggerContext,
} = require("./openapi-utils");

function inferDomain(detail) {
  const [primaryTag] = detail.tags || [];
  if (primaryTag) {
    return primaryTag.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  const fileBase = path.basename(detail.file || "", ".yaml");
  if (fileBase) {
    return fileBase.replace(/[^a-z0-9]+/g, "-");
  }

  return "general";
}

function buildOperationSummary(detail) {
  return {
    path: detail.path,
    method: detail.method,
    file: detail.file,
    summary: detail.summary,
    description: detail.description,
    tags: detail.tags,
    domain: inferDomain(detail),
  };
}

function listOperations() {
  const { openapiSwaggerDir, swaggerDir } = getSwaggerContext();
  const blocks = collectPathBlocks(swaggerDir);

  return blocks.flatMap((block) => {
    const methods = extractMethods(block.blockLines);
    return methods.map((method) =>
      buildOperationSummary({
        path: block.path,
        method,
        file: path.relative(openapiSwaggerDir, block.filePath),
        summary: extractScalar(block.blockLines, /^\s{6}summary:\s+/),
        description: extractScalar(block.blockLines, /^\s{6}description:\s+/),
        tags: extractTags(block.blockLines),
      })
    );
  });
}

function normalize(value) {
  return (value || "").toLowerCase();
}

function hasAnyToken(tokens, values) {
  return values.some((value) => tokens.includes(value));
}

const ACTION_TOKENS = new Set([
  "balance",
  "list",
  "info",
  "history",
  "holders",
  "holder",
  "transferable",
  "inscriptions",
  "summary",
  "details",
  "detail",
  "raw",
  "utxo",
]);

const CONNECTOR_TOKENS = new Set([
  "by",
  "for",
  "of",
  "and",
  "with",
  "named",
  "called",
]);

const HINT_KIND_MAP = {
  ticker: "ticker",
  token: "ticker",
  tick: "ticker",
  symbol: "ticker",
  runeid: "runeid",
  txid: "txid",
  height: "height",
  module: "module",
  index: "index",
};

const BARE_TICKER_EXCLUDED_TOKENS = new Set([
  "address",
  "addr",
  "balance",
  "balances",
  "history",
  "holders",
  "holder",
  "info",
  "inscriptions",
  "list",
  "raw",
  "rune",
  "runeid",
  "runes",
  "summary",
  "ticker",
  "tick",
  "token",
  "transaction",
  "transferable",
  "tx",
  "txid",
  "utxo",
]);

function parseQuery(query) {
  const rawTokens = normalize(query)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const consumedValueIndexes = new Set();
  const entityValues = [];
  const resourceIntents = new Set();

  for (let index = 0; index < rawTokens.length; index += 1) {
    const token = rawTokens[index];
    const kind = HINT_KIND_MAP[token];
    if (token === "address") {
      resourceIntents.add("address");
      continue;
    }
    if (!kind) {
      continue;
    }

    resourceIntents.add(kind);

    const nextToken = rawTokens[index + 1];
    if (!nextToken) {
      continue;
    }
    if (ACTION_TOKENS.has(nextToken) || CONNECTOR_TOKENS.has(nextToken)) {
      continue;
    }

    consumedValueIndexes.add(index + 1);
    entityValues.push({
      kind,
      value: nextToken,
    });
    index += 1;
  }

  const effectiveTokens = rawTokens.filter(
    (token, index) => !consumedValueIndexes.has(index) && !CONNECTOR_TOKENS.has(token)
  );
  const domainIntents = new Set();

  for (let index = 0; index < effectiveTokens.length; index += 1) {
    const token = effectiveTokens[index];
    const nextToken = effectiveTokens[index + 1];
    if (token === "brc20" && nextToken === "prog") {
      domainIntents.add("brc20-prog");
      index += 1;
      continue;
    }
    if (token === "marketplace" || token === "market" || token === "auction") {
      domainIntents.add("marketplace");
      continue;
    }
    if (token === "brc20" || token === "runes" || token === "collection" || token === "domain" || token === "alkane" || token === "alkanes" || token === "swap") {
      domainIntents.add(token);
    }
  }

  const hasTickerHint = resourceIntents.has("ticker");
  const hasBareTickerValue = (domainIntents.has("brc20") || domainIntents.has("brc20-prog")) && !hasTickerHint;
  if (hasBareTickerValue) {
    const bareTickerCandidate = effectiveTokens.find((token) => {
      if (domainIntents.has(token)) {
        return false;
      }
      if (ACTION_TOKENS.has(token) || CONNECTOR_TOKENS.has(token)) {
        return false;
      }
      if (Object.prototype.hasOwnProperty.call(HINT_KIND_MAP, token)) {
        return false;
      }
      if (BARE_TICKER_EXCLUDED_TOKENS.has(token)) {
        return false;
      }
      return true;
    });

    if (bareTickerCandidate) {
      entityValues.push({
        kind: "ticker",
        value: bareTickerCandidate,
      });
    }
  }

  return {
    rawTokens,
    effectiveTokens,
    entityValues,
    resourceIntents: Array.from(resourceIntents),
    domainIntents: Array.from(domainIntents),
  };
}

function hasEntityValue(parsedQuery, kind) {
  return parsedQuery.entityValues.some((item) => item.kind === kind);
}

function getEntityValue(parsedQuery, kind) {
  return parsedQuery.entityValues.find((item) => item.kind === kind)?.value || "";
}

function hasResourceIntent(parsedQuery, kind) {
  return parsedQuery.resourceIntents.includes(kind);
}

function hasRuneIdentifierIntent(parsedQuery) {
  return hasResourceIntent(parsedQuery, "runeid") || hasEntityValue(parsedQuery, "runeid") || (parsedQuery.domainIntents.includes("runes") && (hasResourceIntent(parsedQuery, "ticker") || hasEntityValue(parsedQuery, "ticker") || parsedQuery.rawTokens.includes("rune")));
}

function detectIntentConflicts(parsedQuery) {
  const conflicts = [];
  const tokens = parsedQuery.effectiveTokens;
  const marketplaceIntent = parsedQuery.domainIntents.includes("marketplace");
  const txIntent = hasAnyToken(tokens, ["transaction", "tx", "raw"]);
  const tickerIntent = hasResourceIntent(parsedQuery, "ticker");
  const brc20Intent = parsedQuery.domainIntents.includes("brc20");
  const brc20ProgIntent = parsedQuery.domainIntents.includes("brc20-prog");
  const runesIntent = parsedQuery.domainIntents.includes("runes");
  const balanceIntent = tokens.includes("balance");

  if (balanceIntent && brc20Intent && runesIntent) {
    conflicts.push("query mixes brc20 and runes balance intents");
  }

  if (brc20Intent && brc20ProgIntent) {
    conflicts.push("query mixes brc20 and brc20-prog intents");
  }

  if (txIntent && tickerIntent) {
    conflicts.push("query mixes transaction/txid intent with ticker intent");
  }

  if (marketplaceIntent && tickerIntent && tokens.includes("info")) {
    conflicts.push("query mixes marketplace intent with generic ticker info intent");
  }

  if (marketplaceIntent && tickerIntent && tokens.includes("history")) {
    conflicts.push("query mixes marketplace intent with generic ticker history intent");
  }

  return conflicts;
}

function introList({ domain, method, keyword }) {
  const operations = listOperations()
    .filter((item) => !domain || item.domain === normalize(domain))
    .filter((item) => !method || item.method === normalize(method))
    .filter((item) => {
      if (!keyword) {
        return true;
      }
      const haystack = [
        item.path,
        item.summary,
        item.description,
        item.domain,
        ...(item.tags || []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword.toLowerCase());
    })
    .sort((left, right) => `${left.path}:${left.method}`.localeCompare(`${right.path}:${right.method}`));

  return {
    command: "intro.list",
    mode: "list",
    filters: {
      domain: domain || "",
      method: method || "",
      keyword: keyword || "",
    },
    results: operations,
  };
}

function introShow(apiPath) {
  const detail = getOpenApiDetail(apiPath);
  if (!detail) {
    return {
      command: "intro.show",
      mode: "not_found",
      path: apiPath,
    };
  }

  return {
    command: "intro.show",
    mode: "detail",
    ...detail,
    domain: inferDomain(detail),
    pathParams: detail.parameters.filter((item) => item.in === "path"),
    queryParams: detail.parameters.filter((item) => item.in === "query"),
    headerParams: detail.parameters.filter((item) => item.in === "header"),
    cookieParams: detail.parameters.filter((item) => item.in === "cookie"),
  };
}

function introParams(apiPath) {
  const detail = getOpenApiDetail(apiPath);
  if (!detail) {
    return {
      command: "intro.params",
      mode: "not_found",
      path: apiPath,
    };
  }

  return {
    command: "intro.params",
    mode: "detail",
    path: detail.path,
    method: detail.method,
    domain: inferDomain(detail),
    pathParams: detail.parameters.filter((item) => item.in === "path"),
    queryParams: detail.parameters.filter((item) => item.in === "query"),
    headerParams: detail.parameters.filter((item) => item.in === "header"),
    cookieParams: detail.parameters.filter((item) => item.in === "cookie"),
    requestBodyTemplate: detail.requestBodyTemplate,
  };
}

function quoteForShell(value, shell) {
  if (shell === "powershell") {
    return `'${String(value).replace(/'/g, "''")}'`;
  }
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function introExample(apiPath, shell = "powershell") {
  const plan = buildRequestPlan(apiPath, { includeOptionalQuery: false });
  if (!plan) {
    return {
      command: "intro.example",
      mode: "not_found",
      path: apiPath,
      shell,
    };
  }

  const parts = ["unisat-ai-cli", "api", "call", "--path", quoteForShell(plan.detail.path, shell)];

  plan.pathParams.forEach((item) => {
    parts.push("--path-param", quoteForShell(`${item.name}=${item.value}`, shell));
  });

  plan.queryEntries.forEach((item) => {
    parts.push("--query-param", quoteForShell(`${item.name}=${item.value}`, shell));
  });

  if (plan.detail.requestBodyTemplate) {
    parts.push("--body", quoteForShell(JSON.stringify(plan.detail.requestBodyTemplate), shell));
  }

  parts.push("--format", "json");

  return {
    command: "intro.example",
    mode: "detail",
    path: plan.detail.path,
    method: plan.detail.method,
    domain: inferDomain(plan.detail),
    shell,
    pathParams: plan.pathParams.map((item) => ({ name: item.name, value: item.value })),
    queryParams: plan.queryEntries,
    body: plan.detail.requestBodyTemplate,
    example: parts.join(" "),
  };
}

function introDomains() {
  const results = Array.from(new Set(listOperations().map((item) => item.domain))).sort();
  return {
    command: "intro.domains",
    mode: "list",
    results,
  };
}

function scoreMatch(operation, parsedQuery) {
  const detail = getOpenApiDetail(operation.path);
  const fields = {
    path: normalize(operation.path),
    summary: normalize(operation.summary),
    description: normalize(operation.description),
    domain: normalize(operation.domain),
    tags: normalize((operation.tags || []).join(" ")),
  };

  let score = 0;
  const reasons = [];
  const tokens = parsedQuery.effectiveTokens;
  const rawTokens = parsedQuery.rawTokens;
  const intentConflicts = detectIntentConflicts(parsedQuery);
  const runeIdentifierIntent = hasRuneIdentifierIntent(parsedQuery);
  const tickerValue = getEntityValue(parsedQuery, "ticker");
  const hasTickerValue = Boolean(tickerValue);
  const assetActionIntent = hasAnyToken(tokens, ["balance", "info", "history", "holders", "transferable", "inscriptions"]);

  tokens.forEach((token) => {
    if (fields.path.includes(token)) {
      score += 5;
      reasons.push(`path matches "${token}"`);
      return;
    }
    if (fields.summary.includes(token)) {
      score += 4;
      reasons.push(`summary matches "${token}"`);
      return;
    }
    if (fields.domain.includes(token) || fields.tags.includes(token)) {
      score += 3;
      reasons.push(`domain/tag matches "${token}"`);
      return;
    }
    if (fields.description.includes(token)) {
      score += 2;
      reasons.push(`description matches "${token}"`);
    }
  });

  if (hasResourceIntent(parsedQuery, "address") && operation.path.includes("/address/{address}/")) {
    score += 3;
    reasons.push("address-scoped path");
  }

  if (hasResourceIntent(parsedQuery, "address") && tokens.includes("balance") && fields.domain === "addresses" && fields.path === "/v1/indexer/address/{address}/balance") {
    score += 10;
    reasons.push("generic address balance endpoint preferred");
  }

  if (hasResourceIntent(parsedQuery, "address") && tokens.includes("balance") && fields.domain === "addresses" && fields.path === "/v1/indexer/address/{address}/available-balance") {
    score += 8;
    reasons.push("available address balance endpoint preferred");
  }

  if (hasResourceIntent(parsedQuery, "address") && tokens.includes("balance") && !parsedQuery.domainIntents.includes("runes") && !parsedQuery.domainIntents.includes("brc20") && !parsedQuery.domainIntents.includes("alkane") && !parsedQuery.domainIntents.includes("swap") && fields.domain !== "addresses") {
    score -= 6;
    reasons.push("asset-specific balance endpoint is less preferred for a generic address balance query");
  }

  if (parsedQuery.domainIntents.includes("runes") && (fields.domain === "runes" || fields.tags.includes("runes"))) {
    score += 5;
    reasons.push("runes domain match");
  }

  if (parsedQuery.domainIntents.includes("marketplace") && fields.domain.includes("marketplace")) {
    score += 8;
    reasons.push("marketplace intent match");
  }

  if (parsedQuery.domainIntents.includes("marketplace") && !fields.domain.includes("marketplace")) {
    score -= 4;
    reasons.push("non-marketplace endpoint is less preferred for marketplace intent");
  }

  if (parsedQuery.domainIntents.includes("marketplace") && tokens.includes("list") && !parsedQuery.domainIntents.includes("brc20") && !parsedQuery.domainIntents.includes("runes") && !parsedQuery.domainIntents.includes("collection") && !parsedQuery.domainIntents.includes("domain") && !parsedQuery.domainIntents.includes("alkane")) {
    if (fields.domain !== "marketplace-brc20") {
      score -= 2;
      reasons.push("ambiguous marketplace list query should avoid arbitrarily preferring a non-default market domain");
    } else {
      score += 2;
      reasons.push("default marketplace domain preference for ambiguous market list query");
    }
  }

  if (parsedQuery.domainIntents.includes("collection") && fields.domain === "collection-indexer") {
    score += 6;
    reasons.push("collection-indexer domain match");
  }

  if (parsedQuery.domainIntents.includes("collection") && fields.domain === "alkanes" && !parsedQuery.domainIntents.includes("alkane")) {
    score -= 6;
    reasons.push("alkanes endpoint is less preferred unless query explicitly asks for alkane");
  }

  if (parsedQuery.domainIntents.includes("brc20") && !parsedQuery.domainIntents.includes("brc20-prog") && (fields.domain.includes("brc-20") || fields.domain === "brc20" || fields.tags.includes("brc-20"))) {
    score += 5;
    reasons.push("brc20 domain match");
  }

  if (parsedQuery.domainIntents.includes("brc20") && !parsedQuery.domainIntents.includes("brc20-prog") && fields.domain === "brc-20") {
    score += 3;
    reasons.push("standard brc20 endpoint preference");
  }

  if (parsedQuery.domainIntents.includes("brc20-prog") && fields.domain === "brc20-prog") {
    score += 8;
    reasons.push("brc20-prog domain match");
  }

  if (parsedQuery.domainIntents.includes("brc20-prog") && fields.domain === "brc-20") {
    score -= 8;
    reasons.push("standard brc20 endpoint is less preferred for brc20-prog intent");
  }

  if (parsedQuery.domainIntents.includes("brc20") && !parsedQuery.domainIntents.includes("brc20-prog") && fields.domain === "brc20-prog") {
    score -= 4;
    reasons.push("brc20-prog is deprioritized unless query explicitly asks for brc20-prog");
  }

  if (hasResourceIntent(parsedQuery, "ticker") && tokens.includes("info") && fields.path === "/v1/indexer/brc20/{ticker}/info") {
    score += 8;
    reasons.push("standard brc20 ticker info endpoint preferred");
  }

  if (parsedQuery.domainIntents.includes("runes") && tokens.includes("info") && fields.path === "/v1/indexer/runes/{runeid}/info") {
    score += 10;
    reasons.push("standard runes info endpoint preferred");
  }

  if (tokens.includes("runes") && runeIdentifierIntent && fields.path === "/v1/indexer/runes/{runeid}/info") {
    score += 8;
    reasons.push("runes identifier intent maps to {runeid}");
  }

  if (tokens.includes("runes") && tokens.includes("holders") && fields.path === "/v1/indexer/runes/{runeid}/holders") {
    score += 12;
    reasons.push("standard runes holders endpoint preferred");
  }

  if (tokens.includes("runes") && tokens.includes("holders") && runeIdentifierIntent && fields.path === "/v1/indexer/runes/{runeid}/holders") {
    score += 8;
    reasons.push("runes holder query maps identifier intent to {runeid}");
  }

  if (tokens.includes("runes") && tokens.includes("history") && fields.path === "/v1/indexer/runes/event") {
    score += 12;
    reasons.push("runes history maps to event endpoint");
  }

  if (tokens.includes("runes") && tokens.includes("balance") && tokens.includes("runeid") && fields.path === "/v1/indexer/address/{address}/runes/{runeid}/balance") {
    score += 12;
    reasons.push("runes balance by runeid prefers address-scoped balance endpoint");
  }

  if (tokens.includes("runes") && tokens.includes("utxo") && tokens.includes("runeid") && fields.path === "/v1/indexer/address/{address}/runes/{runeid}/utxo") {
    score += 12;
    reasons.push("runes utxo by runeid prefers address-scoped utxo endpoint");
  }

  if ((tokens.includes("marketplace") || tokens.includes("market") || tokens.includes("auction")) && tokens.includes("ticker") && tokens.includes("info") && fields.path === "/v1/indexer/brc20/{ticker}/info") {
    score -= 7;
    reasons.push("generic ticker info endpoint is less preferred when marketplace intent is explicit");
  }

  if (parsedQuery.domainIntents.includes("runes") && fields.path === "/v1/indexer/brc20/{ticker}/info") {
    score -= 9;
    reasons.push("brc20 ticker info is less preferred for runes intent");
  }

  if (hasResourceIntent(parsedQuery, "ticker") && tokens.includes("info") && fields.path === "/v1/indexer/brc20-prog/{ticker}/info" && !parsedQuery.domainIntents.includes("brc20-prog")) {
    score -= 5;
    reasons.push("brc20-prog ticker info is less preferred unless query explicitly asks for prog");
  }

  if (tokens.includes("balance") && fields.description.includes("balance")) {
    score += 3;
    reasons.push("description mentions balance");
  }

  if (tokens.includes("list") && fields.path.includes("list")) {
    score += 4;
    reasons.push("list-style path");
  }

  if (tokens.includes("list") && (fields.summary.includes("summary") || fields.description.includes("summary"))) {
    score += 2;
    reasons.push('summary can act as a token list');
  }

  if (tokens.includes("balance") && fields.path.includes("balance-list")) {
    score += 4;
    reasons.push("balance-list path");
  }

  if (tokens.includes("transferable") && tokens.includes("inscriptions") && fields.path.includes("transferable-inscriptions")) {
    score += 12;
    reasons.push("explicit transferable-inscriptions action match");
  }

  if ((tokens.includes("marketplace") || tokens.includes("market")) && tokens.includes("list") && fields.path.endsWith("/auction/list")) {
    score += 6;
    reasons.push("generic marketplace list endpoint preferred");
  }

  if ((tokens.includes("marketplace") || tokens.includes("market")) && tokens.includes("list") && fields.path.includes("info_list") && !tokens.includes("inscription") && !tokens.includes("info")) {
    score -= 4;
    reasons.push("specialized info-list endpoint is less preferred for a generic marketplace list query");
  }

  if (tokens.includes("collection") && tokens.includes("items") && fields.path.includes("/collection/{collectionid}/items")) {
    score += 10;
    reasons.push("explicit collection items action match");
  }

  if (tokens.includes("collection") && tokens.includes("id") && fields.path.includes("{collectionid}")) {
    score += 6;
    reasons.push("collectionId resource match");
  }

  if (parsedQuery.domainIntents.includes("runes") && fields.description.includes("will not be included")) {
    score -= 6;
    reasons.push('description excludes "runes" balances');
  }

  if (parsedQuery.domainIntents.includes("runes") && fields.description.includes("not be included")) {
    score -= 4;
  }

  if (parsedQuery.domainIntents.includes("runes") && !fields.path.includes("runes") && !fields.domain.includes("runes")) {
    score -= 3;
    reasons.push("not a runes-scoped interface");
  }

  if (tokens.includes("list") && fields.path.includes("/{runeid}/")) {
    score -= 4;
    reasons.push("requires a specific runeid instead of returning a list");
  }

  const requiredPathParams = (detail?.parameters || [])
    .filter((item) => item.in === "path" && item.required)
    .map((item) => normalize(item.name));

  if (hasEntityValue(parsedQuery, "ticker") && requiredPathParams.includes("ticker")) {
    score += 8;
    reasons.push("query provides a ticker value");
  }

  if (hasTickerValue && parsedQuery.domainIntents.includes("brc20") && !parsedQuery.domainIntents.includes("brc20-prog") && requiredPathParams.includes("ticker")) {
    score += 10;
    reasons.push("brc20 query with a consumed ticker value prefers ticker-parameterized interfaces");
  }

  if (hasTickerValue && parsedQuery.domainIntents.includes("brc20-prog") && requiredPathParams.includes("ticker") && fields.domain === "brc20-prog") {
    score += 10;
    reasons.push("brc20-prog query with a consumed ticker value prefers prog ticker interfaces");
  }

  if (hasTickerValue && (parsedQuery.domainIntents.includes("brc20") || parsedQuery.domainIntents.includes("brc20-prog")) && assetActionIntent && !requiredPathParams.includes("ticker") && fields.domain === "addresses") {
    score -= 16;
    reasons.push("generic address balance/info endpoint is less preferred when query already specifies an asset ticker value");
  }

  if (hasTickerValue && parsedQuery.domainIntents.includes("brc20") && !parsedQuery.domainIntents.includes("brc20-prog") && assetActionIntent && !requiredPathParams.includes("ticker") && fields.domain === "brc-20" && !fields.path.includes("/{ticker}")) {
    score -= 10;
    reasons.push("non-ticker brc20 endpoint is less preferred when query already specifies a ticker value");
  }

  if (hasTickerValue && parsedQuery.domainIntents.includes("brc20") && !parsedQuery.domainIntents.includes("brc20-prog") && assetActionIntent && requiredPathParams.includes("ticker") && fields.path.includes("/address/{address}/brc20/{ticker}/")) {
    score += 10;
    reasons.push("address-level brc20 ticker endpoint preferred when query includes a concrete ticker value");
  }

  if (hasEntityValue(parsedQuery, "runeid") && requiredPathParams.includes("runeid")) {
    score += 8;
    reasons.push("query provides a runeid-like value");
  }

  if (tokens.includes("list") && fields.summary.includes("summary")) {
    score += 3;
    reasons.push("summary endpoint fits list-style query");
  }

  if (tokens.includes("brc20") && tokens.includes("list") && fields.path.includes("/brc20/summary")) {
    score += 4;
    reasons.push("address-level brc20 summary is preferred for balance lists");
  }

  if (tokens.includes("runes") && tokens.includes("list") && fields.path.includes("/runes/balance-list")) {
    score += 4;
    reasons.push("address-level runes balance list is preferred");
  }

  if ((tokens.includes("transaction") || tokens.includes("tx")) && fields.domain === "transactions") {
    score += 3;
    reasons.push("transactions domain match");
  }

  if ((tokens.includes("details") || tokens.includes("detail") || tokens.includes("info")) && fields.path === "/v1/indexer/tx/{txid}") {
    score += 6;
    reasons.push("standard tx detail endpoint preferred for details/info queries");
  }

  if (!tokens.includes("transaction") && !tokens.includes("tx") && !tokens.includes("raw") && fields.path === "/v1/indexer/tx/{txid}") {
    score -= 6;
    reasons.push("tx detail endpoint is less preferred when query is not about transactions");
  }

  if ((tokens.includes("details") || tokens.includes("detail") || tokens.includes("info")) && fields.path === "/v1/indexer/rawtx/{txid}") {
    score -= 4;
    reasons.push("raw tx endpoint is less preferred for details/info queries");
  }

  if (tokens.includes("raw") && fields.path === "/v1/indexer/rawtx/{txid}") {
    score += 6;
    reasons.push("raw tx endpoint preferred for raw queries");
  }

  if (tokens.includes("raw") && tokens.includes("ticker") && fields.path === "/v1/indexer/rawtx/{txid}") {
    score -= 4;
    reasons.push("raw tx endpoint is weakened because query also asks for ticker");
  }

  if (tokens.includes("raw") && fields.path === "/v1/indexer/tx/{txid}") {
    score -= 3;
    reasons.push("standard tx detail endpoint is less preferred for raw queries");
  }

  if ((tokens.includes("transaction") || tokens.includes("tx") || tokens.includes("raw")) && tokens.includes("ticker") && fields.path === "/v1/indexer/brc20/{ticker}/info") {
    score -= 6;
    reasons.push("ticker info endpoint is weakened because query also asks for transaction/raw tx");
  }

  if ((tokens.includes("transaction") || tokens.includes("tx") || tokens.includes("raw")) && tokens.includes("ticker") && fields.path.includes("/{ticker}/history")) {
    score -= 6;
    reasons.push("ticker history endpoint is weakened because query also asks for transaction/raw tx");
  }

  if ((tokens.includes("marketplace") || tokens.includes("market") || tokens.includes("auction")) && tokens.includes("ticker") && tokens.includes("history") && fields.path.includes("/{ticker}/history")) {
    score -= 6;
    reasons.push("generic ticker history endpoint is less preferred when marketplace intent is explicit");
  }

  if ((tokens.includes("marketplace") || tokens.includes("market") || tokens.includes("auction")) && tokens.includes("brc20") && (tokens.includes("ticker") || tokens.includes("tick")) && tokens.includes("history") && fields.path.endsWith("/brc20_kline")) {
    score += 8;
    reasons.push("marketplace brc20 ticker history maps to kline endpoint");
  }

  if ((tokens.includes("details") || tokens.includes("detail") || tokens.includes("info")) && fields.path.includes("/utxo/")) {
    score -= 3;
    reasons.push("utxo endpoint is less preferred for transaction detail queries");
  }

  if (!hasResourceIntent(parsedQuery, "address") && operation.path.includes("/address/{address}/")) {
    score -= 5;
    reasons.push("address-scoped endpoint is less preferred when query does not mention address");
  }

  if (!hasResourceIntent(parsedQuery, "ticker") && !hasEntityValue(parsedQuery, "ticker") && requiredPathParams.includes("ticker")) {
    score -= 10;
    reasons.push("requires ticker but query did not provide one");
  }

  if (!hasResourceIntent(parsedQuery, "txid") && !hasEntityValue(parsedQuery, "txid") && requiredPathParams.includes("txid")) {
    score -= 8;
    reasons.push("requires txid but query did not provide one");
  }

  if (!runeIdentifierIntent && requiredPathParams.includes("runeid")) {
    score -= 6;
    reasons.push("requires runeid but query did not provide one");
  }

  if (!tokens.includes("height") && requiredPathParams.includes("height")) {
    score -= 3;
    reasons.push("requires height but query did not request a historical view");
  }

  if (intentConflicts.length > 0) {
    score -= Math.min(6, intentConflicts.length * 3);
    reasons.push(...intentConflicts);
  }

  return {
    score,
    reasons,
  };
}

function introFind(query) {
  const parsedQuery = parseQuery(query);

  const matches = listOperations()
    .map((operation) => {
      const { score, reasons } = scoreMatch(operation, parsedQuery);
      return {
        ...operation,
        score,
        whyMatched: Array.from(new Set(reasons)).join("; "),
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, 10);

  return {
    command: "intro.find",
    mode: "matches",
    query,
    matches,
  };
}

function commonPathPrefix(left, right) {
  const leftParts = left.split("/");
  const rightParts = right.split("/");
  const shared = [];

  for (let index = 0; index < Math.min(leftParts.length, rightParts.length); index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      break;
    }
    if (leftParts[index]) {
      shared.push(leftParts[index]);
    }
  }

  return shared.length;
}

function introRelated(apiPath) {
  const detail = getOpenApiDetail(apiPath);
  if (!detail) {
    return {
      command: "intro.related",
      mode: "not_found",
      path: apiPath,
    };
  }

  const related = listOperations()
    .filter((item) => item.path !== detail.path)
    .map((item) => {
      let score = commonPathPrefix(detail.path, item.path);
      if (item.domain === inferDomain(detail)) {
        score += 3;
      }
      if ((item.tags || []).some((tag) => (detail.tags || []).includes(tag))) {
        score += 2;
      }
      return {
        ...item,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, 8)
    .map(({ score, ...item }) => item);

  return {
    command: "intro.related",
    mode: "list",
    path: detail.path,
    results: related,
  };
}

function introGuide() {
  return {
    command: "intro.guide",
    mode: "detail",
    title: "CLI onboarding",
    steps: [
      {
        step: 1,
        goal: "See the major API domains supported by this CLI.",
        command: "unisat-ai-cli intro domains --format text",
      },
      {
        step: 2,
        goal: "Resolve the best interface, parameters, and runnable example in one step.",
        command: 'unisat-ai-cli intro resolve --query "address brc20 balance list" --shell powershell --format text',
      },
      {
        step: 3,
        goal: "Call the real API after replacing placeholders with real values.",
        command:
          'unisat-ai-cli api call --path "/v1/indexer/address/{address}/brc20/summary" --path-params "address=YOUR_ADDRESS" --query "start=0&limit=16" --format json',
      },
    ],
    notes: [
      "Prefer the compact flow: intro resolve -> api call.",
      "Only use intro find/show/params/example when you need manual control over candidate selection or request construction.",
      "Use --format json when another agent or script needs stable machine-readable output.",
      "api call requires either --api-key or UNISAT_API_KEY in the current shell.",
    ],
  };
}

function introCapabilities() {
  const operations = listOperations();
  const domains = Array.from(new Set(operations.map((item) => item.domain))).sort();
  const actions = Array.from(
    new Set(
      operations.flatMap((item) =>
        item.path
          .split("/")
          .filter(Boolean)
          .filter((part) => !part.startsWith("{") && !/^v\d+$/.test(part))
      )
    )
  ).sort();

  return {
    command: "intro.capabilities",
    mode: "detail",
    domains,
    actions,
    totalOperations: operations.length,
  };
}

function introTasks() {
  const tasks = [
    {
      name: "get-address-brc20-balances",
      summary: "Find the BRC-20 token balance list for an address.",
      query: "address brc20 balance list",
      suggestedPath: "/v1/indexer/address/{address}/brc20/summary",
    },
    {
      name: "get-address-runes-balances",
      summary: "Find the runes balance list for an address.",
      query: "address runes balance list",
      suggestedPath: "/v1/indexer/address/{address}/runes/balance-list",
    },
    {
      name: "get-transaction-info",
      summary: "Find the transaction detail interface by txid.",
      query: "transaction details by txid",
      suggestedPath: "/v1/indexer/tx/{txid}",
    },
    {
      name: "get-brc20-ticker-info",
      summary: "Find token information for a BRC-20 ticker.",
      query: "brc20 ticker info",
      suggestedPath: "/v1/indexer/brc20/{ticker}/info",
    },
  ];

  return {
    command: "intro.tasks",
    mode: "list",
    tasks,
  };
}

function introTask(name, shell = "powershell") {
  const tasksPayload = introTasks();
  const task = tasksPayload.tasks.find((item) => item.name === name);

  if (!task) {
    return {
      command: "intro.task",
      mode: "not_found",
      name,
      available: tasksPayload.tasks.map((item) => item.name),
    };
  }

  return {
    command: "intro.task",
    mode: "detail",
    ...task,
    resolveCommand: `unisat-ai-cli intro resolve --query ${quoteForShell(task.query, shell)} --shell ${shell} --format text`,
    showCommand: `unisat-ai-cli intro show --path ${quoteForShell(task.suggestedPath, shell)} --format text`,
    paramsCommand: `unisat-ai-cli intro params --path ${quoteForShell(task.suggestedPath, shell)} --format text`,
    exampleCommand: `unisat-ai-cli intro example --path ${quoteForShell(task.suggestedPath, shell)} --shell ${shell} --format text`,
  };
}

function inferConfidence(score) {
  if (score >= 18) {
    return "high";
  }
  if (score >= 10) {
    return "medium";
  }
  return "low";
}

function dedupeAlternatives(items, selectedPath, top) {
  return items
    .filter((item) => item.path !== selectedPath)
    .filter((item, index, all) => all.findIndex((candidate) => candidate.path === item.path) === index)
    .slice(0, top);
}

function classifyMissingInputs(parameters, query) {
  const parsedQuery = typeof query === "string" ? parseQuery(query) : query;
  const requiredParams = parameters.filter((item) => item.required);
  const businessHints = ["address", "ticker", "txid", "runeid", "height", "index", "module"];
  const defaultableQueryParams = ["start", "limit", "cursor", "size"];

  const missingBusinessInputs = requiredParams
    .filter((item) => item.in === "path" || item.in === "query")
    .filter((item) => !hasResourceIntent(parsedQuery, normalize(item.name)))
    .filter((item) => !hasEntityValue(parsedQuery, normalize(item.name)))
    .filter((item) => businessHints.includes(normalize(item.name)))
    .map((item) => item.name);

  const missingDefaultableInputs = requiredParams
    .filter((item) => item.in === "query")
    .filter((item) => !hasResourceIntent(parsedQuery, normalize(item.name)))
    .filter((item) => defaultableQueryParams.includes(normalize(item.name)))
    .map((item) => item.name);

  return {
    missingBusinessInputs,
    missingDefaultableInputs,
  };
}

function collectAmbiguitySignals(queryPayload, selectedMatch, parsedQuery) {
  const rankingNotes = [];
  const conflictingSignals = detectIntentConflicts(parsedQuery);
  const topMatches = (queryPayload?.matches || []).slice(0, 3);
  const distinctTopDomains = Array.from(new Set(topMatches.map((item) => item.domain)));
  const topScoreGap = topMatches.length > 1 ? topMatches[0].score - topMatches[1].score : null;

  if (selectedMatch) {
    rankingNotes.push("selected from intro.find top-ranked candidate");
  }

  if (topMatches.length > 1) {
    if (topScoreGap <= 2) {
      rankingNotes.push(`top candidates are close in score (${topMatches[0].score} vs ${topMatches[1].score})`);
    }
  }

  if (distinctTopDomains.length > 1) {
    rankingNotes.push(`top candidates span multiple domains: ${distinctTopDomains.join(", ")}`);
  }

  rankingNotes.push(...conflictingSignals);

  return {
    rankingNotes,
    conflictingSignals,
    topScoreGap,
    distinctTopDomains,
    ambiguousIntent: conflictingSignals.length > 0 || (topMatches.length > 1 && topScoreGap <= 2 && distinctTopDomains.length > 1),
  };
}

function introResolve({ query, apiPath, shell = "powershell", top = 5 }) {
  if (!query && !apiPath) {
    return {
      command: "intro.resolve",
      mode: "missing_input",
      message: "Provide --query or --path",
    };
  }

  let selectedPath = apiPath;
  let queryPayload = null;
  let selectedMatch = null;
  let parsedQuery = null;

  if (query) {
    parsedQuery = parseQuery(query);
    queryPayload = introFind(query);
    if (queryPayload.matches.length === 0) {
      return {
        command: "intro.resolve",
        mode: "not_found",
        query,
        matches: [],
      };
    }

    [selectedMatch] = queryPayload.matches;
    selectedPath = selectedMatch.path;
  }

  const showPayload = introShow(selectedPath);
  if (showPayload.mode === "not_found") {
    return {
      command: "intro.resolve",
      mode: "not_found",
      path: selectedPath,
      matches: [],
    };
  }

  const paramsPayload = introParams(selectedPath);
  const examplePayload = introExample(selectedPath, shell);
  const relatedPayload = introRelated(selectedPath);
  const alternatives = queryPayload
    ? dedupeAlternatives(queryPayload.matches, selectedPath, top)
    : dedupeAlternatives(relatedPayload.results, selectedPath, top);

  const whyMatched = selectedMatch?.whyMatched
    ? selectedMatch.whyMatched.split("; ").filter(Boolean)
    : [];
  const {
    missingBusinessInputs,
    missingDefaultableInputs,
  } = query
    ? classifyMissingInputs(showPayload.parameters, parsedQuery)
    : { missingBusinessInputs: [], missingDefaultableInputs: [] };

  const rankingNotes = [];
  let conflictingSignals = [];
  let ambiguousIntent = false;
  let topScoreGap = null;
  let distinctTopDomains = [];
  if (selectedMatch) {
    const ambiguity = collectAmbiguitySignals(queryPayload, selectedMatch, parsedQuery);
    rankingNotes.push(...ambiguity.rankingNotes);
    conflictingSignals = ambiguity.conflictingSignals;
    ambiguousIntent = ambiguity.ambiguousIntent;
    topScoreGap = ambiguity.topScoreGap;
    distinctTopDomains = ambiguity.distinctTopDomains;
  } else {
    rankingNotes.push("resolved directly from the provided path");
  }
  if (alternatives.length > 0) {
    rankingNotes.push(`kept ${alternatives.length} alternative interface(s) for fallback`);
  }

  let confidence = inferConfidence(selectedMatch?.score ?? 0);
  if (missingBusinessInputs.length > 0 && confidence === "high") {
    confidence = "medium";
  }
  if (missingBusinessInputs.length > 0 && confidence === "medium") {
    confidence = "low";
  }
  if (ambiguousIntent && confidence === "high") {
    confidence = "medium";
  }
  if (conflictingSignals.length > 0 && confidence === "medium") {
    confidence = "low";
  }

  const shouldReturnAmbiguous = Boolean(
    query
      && (
        (ambiguousIntent && conflictingSignals.length > 0 && !missingBusinessInputs.length)
        || ((selectedMatch?.score ?? 0) <= 12 && queryPayload && queryPayload.matches.length > 1)
        || (topScoreGap !== null && topScoreGap <= 2 && distinctTopDomains.length > 1 && confidence === "low" && !missingBusinessInputs.length)
      )
  );

  return {
    command: "intro.resolve",
    mode: shouldReturnAmbiguous ? "ambiguous" : "resolved",
    query: query || "",
    path: apiPath || "",
    shell,
    top,
    selected: {
      path: showPayload.path,
      method: showPayload.method,
      domain: showPayload.domain,
      file: showPayload.file,
      summary: showPayload.summary,
      description: showPayload.description,
      tags: showPayload.tags,
      operationId: showPayload.operationId,
      servers: showPayload.servers,
    },
    match: {
      score: selectedMatch?.score ?? null,
      confidence,
      whyMatched,
      missingBusinessInputs,
      missingDefaultableInputs,
      ambiguousIntent,
      conflictingSignals,
      rankingNotes,
    },
    parameters: {
      pathParams: paramsPayload.pathParams,
      queryParams: paramsPayload.queryParams,
      headerParams: paramsPayload.headerParams,
      cookieParams: paramsPayload.cookieParams,
      requestBodyTemplate: paramsPayload.requestBodyTemplate,
    },
    example: {
      shell: examplePayload.shell,
      command: shouldReturnAmbiguous ? "" : examplePayload.example,
    },
    alternatives,
  };
}

module.exports = {
  introCapabilities,
  introGuide,
  introDomains,
  introExample,
  introFind,
  introList,
  introParams,
  introResolve,
  introRelated,
  introShow,
  introTask,
  introTasks,
};
