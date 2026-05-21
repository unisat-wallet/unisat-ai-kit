const path = require("path");
const { buildRequestPlan } = require("./openapi-request");
const { DEFAULT_OPENAPI_ENVIRONMENT } = require("./openapi-environments");
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
  "action",
  "actions",
  "add",
  "all",
  "available",
  "balance",
  "balances",
  "batch",
  "bid",
  "block",
  "blockchain",
  "cancel",
  "claim",
  "commit",
  "config",
  "confirm",
  "create",
  "deploy",
  "list",
  "events",
  "fee",
  "fees",
  "gas",
  "info",
  "kline",
  "history",
  "holders",
  "holder",
  "inscribe",
  "inscriptions",
  "limit",
  "liquidity",
  "market",
  "mint",
  "order",
  "orders",
  "pool",
  "pre",
  "price",
  "psbt",
  "quote",
  "raw",
  "records",
  "remove",
  "send",
  "sell",
  "split",
  "stat",
  "stats",
  "status",
  "summary",
  "swap",
  "token",
  "tokens",
  "transaction",
  "transactions",
  "transferable",
  "inscriptions",
  "details",
  "detail",
  "utxo",
  "withdraw",
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
  address: "address",
  addr: "address",
  ticker: "ticker",
  token: "ticker",
  tick: "ticker",
  symbol: "ticker",
  runeid: "runeid",
  rune: "runeid",
  txid: "txid",
  tx: "txid",
  alkaneid: "alkaneid",
  alkane: "alkaneid",
  collectionid: "collectionid",
  collection: "collectionid",
  inscriptionid: "inscriptionid",
  inscription: "inscriptionid",
  orderid: "orderid",
  order: "orderid",
  blockid: "blockid",
  block: "blockid",
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

const DOMAIN_TOKEN_ALIASES = {
  alkane: "alkane",
  alkanes: "alkane",
  auction: "marketplace",
  bitcoin: "blockchain",
  brc20: "brc20",
  cat20: "cat20",
  collection: "collection",
  collections: "collection",
  dex: "dex",
  domain: "domain",
  domains: "domain",
  fb: "fractal",
  fractal: "fractal",
  inscribe: "inscribe",
  inscription: "inscription",
  inscriptions: "inscription",
  market: "marketplace",
  marketplace: "marketplace",
  price: "price",
  rune: "runes",
  runes: "runes",
  swap: "swap",
};

const ACTION_TOKEN_ALIASES = {
  actions: "actions",
  add: "add",
  all: "all",
  available: "available",
  balance: "balance",
  balances: "balance",
  batch: "batch",
  bid: "bid",
  bids: "bid",
  block: "block",
  blocks: "block",
  cancel: "cancel",
  claim: "claim",
  commit: "commit",
  config: "config",
  confirm: "confirm",
  create: "create",
  deploy: "deploy",
  detail: "detail",
  details: "detail",
  event: "event",
  events: "event",
  fee: "fee",
  fees: "fee",
  gas: "gas",
  history: "history",
  holder: "holders",
  holders: "holders",
  info: "info",
  kline: "kline",
  list: "list",
  listing: "list",
  listings: "list",
  liquidity: "liquidity",
  mint: "mint",
  order: "order",
  orders: "order",
  pool: "pool",
  price: "price",
  psbt: "psbt",
  quote: "quote",
  raw: "raw",
  records: "records",
  remove: "remove",
  send: "send",
  sell: "sell",
  split: "split",
  stat: "stat",
  stats: "stat",
  status: "status",
  summary: "summary",
  swap: "swap",
  transaction: "transaction",
  transactions: "transaction",
  transferable: "transferable",
  transfers: "transfer",
  transfer: "transfer",
  utxo: "utxo",
  withdraw: "withdraw",
};

const RESOURCE_TOKEN_ALIASES = {
  addr: "address",
  address: "address",
  alkane: "alkaneid",
  alkaneid: "alkaneid",
  block: "blockid",
  blockid: "blockid",
  collection: "collectionid",
  collectionid: "collectionid",
  height: "height",
  index: "index",
  inscription: "inscriptionid",
  inscriptionid: "inscriptionid",
  module: "module",
  order: "orderid",
  orderid: "orderid",
  rune: "runeid",
  runeid: "runeid",
  symbol: "ticker",
  tick: "ticker",
  ticker: "ticker",
  token: "ticker",
  tx: "txid",
  txid: "txid",
};

function normalizeToken(token) {
  return normalize(token).replace(/[^a-z0-9]+/g, "");
}

function canonicalResourceKind(kind) {
  const normalized = normalizeToken(kind);
  return RESOURCE_TOKEN_ALIASES[normalized] || normalized;
}

function addCanonical(set, aliases, token) {
  const normalized = normalizeToken(token);
  const canonical = aliases[normalized];
  if (canonical) {
    set.add(canonical);
    return canonical;
  }
  return "";
}

function parseQuery(query) {
  const rawTokens = normalize(query)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const consumedValueIndexes = new Set();
  const entityValues = [];
  const resourceIntents = new Set();
  const domainIntents = new Set();
  const actionIntents = new Set();

  for (let index = 0; index < rawTokens.length; index += 1) {
    const token = rawTokens[index];
    const nextToken = rawTokens[index + 1];

    if (token === "brc20" && nextToken === "prog") {
      domainIntents.add("brc20-prog");
      consumedValueIndexes.add(index + 1);
      index += 1;
      continue;
    }

    addCanonical(domainIntents, DOMAIN_TOKEN_ALIASES, token);
    addCanonical(actionIntents, ACTION_TOKEN_ALIASES, token);

    const kind = HINT_KIND_MAP[token] || RESOURCE_TOKEN_ALIASES[token];
    if (!kind) {
      continue;
    }

    const canonicalKind = canonicalResourceKind(kind);
    resourceIntents.add(canonicalKind);

    if (!nextToken) {
      continue;
    }
    if (ACTION_TOKENS.has(nextToken) || CONNECTOR_TOKENS.has(nextToken)) {
      continue;
    }
    if (DOMAIN_TOKEN_ALIASES[nextToken] || RESOURCE_TOKEN_ALIASES[nextToken]) {
      continue;
    }

    consumedValueIndexes.add(index + 1);
    entityValues.push({
      kind: canonicalKind,
      value: nextToken,
    });
    index += 1;
  }

  const effectiveTokens = rawTokens.filter(
    (token, index) => !consumedValueIndexes.has(index) && !CONNECTOR_TOKENS.has(token)
  );

  effectiveTokens.forEach((token) => {
    addCanonical(domainIntents, DOMAIN_TOKEN_ALIASES, token);
    addCanonical(actionIntents, ACTION_TOKEN_ALIASES, token);
  });

  if (domainIntents.has("brc20-prog")) {
    domainIntents.delete("brc20");
  }

  const hasTickerHint = resourceIntents.has("ticker");
  const canInferBareTicker = (domainIntents.has("brc20") || domainIntents.has("brc20-prog")) && !hasTickerHint;
  if (canInferBareTicker) {
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
      if (DOMAIN_TOKEN_ALIASES[token] || RESOURCE_TOKEN_ALIASES[token]) {
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
    actionIntents: Array.from(actionIntents),
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

  if (marketplaceIntent && tickerIntent && tokens.includes("info") && !brc20Intent && !runesIntent) {
    conflicts.push("query mixes marketplace intent with generic ticker info intent");
  }

  if (marketplaceIntent && tickerIntent && tokens.includes("history") && !brc20Intent && !runesIntent) {
    conflicts.push("query mixes marketplace intent with generic ticker history intent");
  }

  return conflicts;
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

function buildParamsPayload(apiPath) {
  const detail = getOpenApiDetail(apiPath);
  if (!detail) {
    return {
      mode: "not_found",
      path: apiPath,
    };
  }

  return {
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

function buildExamplePayload(apiPath, shell = "powershell", environment = DEFAULT_OPENAPI_ENVIRONMENT) {
  const plan = buildRequestPlan(apiPath, { environment, includeOptionalQuery: false });
  if (!plan) {
    return {
      mode: "not_found",
      path: apiPath,
      shell,
    };
  }

  if (plan.mode === "invalid_environment") {
    return {
      mode: "invalid_environment",
      path: apiPath,
      shell,
      environment,
    };
  }

  const parts = [
    "unisat-ai-cli",
    "api",
    "call",
    "--env",
    quoteForShell(plan.environment.name, shell),
    "--path",
    quoteForShell(plan.detail.path, shell),
  ];

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
    mode: "detail",
    path: plan.detail.path,
    method: plan.detail.method,
    domain: inferDomain(plan.detail),
    shell,
    environment: plan.environment.name,
    environmentLabel: plan.environment.label,
    pathParams: plan.pathParams.map((item) => ({ name: item.name, value: item.value })),
    queryParams: plan.queryEntries,
    body: plan.detail.requestBodyTemplate,
    example: parts.join(" "),
  };
}

function tokenizeText(value) {
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function canonicalDomainToken(token) {
  return DOMAIN_TOKEN_ALIASES[normalizeToken(token)] || "";
}

function canonicalActionToken(token) {
  return ACTION_TOKEN_ALIASES[normalizeToken(token)] || "";
}

function inferProfileDomains(operation, detail, pathTokens, tagTokens) {
  const domains = new Set();
  const fileBase = path.basename(detail?.file || operation.file || "", ".yaml");
  const sources = [operation.domain, fileBase, ...(operation.tags || []), ...(detail?.tags || []), ...pathTokens, ...tagTokens];

  sources.forEach((source) => {
    tokenizeText(source).forEach((token) => {
      const domain = canonicalDomainToken(token);
      if (domain) {
        domains.add(domain);
      }
    });
  });

  if (pathTokens.includes("market") || pathTokens.includes("auction") || fileBase.includes("marketplace")) {
    domains.add("marketplace");
  }
  if (operation.path.includes("brc20-prog") || fileBase.includes("brc20-prog") || normalize(operation.domain).includes("brc20-prog")) {
    domains.add("brc20-prog");
    domains.delete("brc20");
  }
  if (pathTokens.includes("brc20") && pathTokens.includes("swap")) {
    domains.add("brc20");
    domains.add("swap");
  }
  if (fileBase.includes("indexer")) {
    domains.add("indexer");
  }
  if (fileBase.includes("marketplace")) {
    domains.add("marketplace");
  }

  return domains;
}

function inferProfileActions(operation, detail, allTokens) {
  const actions = new Set();
  allTokens.forEach((token) => {
    const action = canonicalActionToken(token);
    if (action) {
      actions.add(action);
    }
  });

  const pathText = normalize(operation.path);
  const summaryText = normalize(`${operation.summary || ""} ${detail?.summary || ""}`);
  if (pathText.includes("balance-list") || summaryText.includes("balance list")) {
    actions.add("balance");
    actions.add("list");
  }
  if (pathText.includes("kline")) {
    actions.add("history");
    actions.add("kline");
  }
  if (pathText.includes("utxo")) {
    actions.add("utxo");
  }
  if (pathText.includes("rawtx")) {
    actions.add("raw");
    actions.add("transaction");
  }
  if (pathText.includes("statistic") || pathText.includes("stats")) {
    actions.add("stat");
  }

  return actions;
}

function buildOperationProfile(operation) {
  const detail = getOpenApiDetail(operation.path);
  const parameters = detail?.parameters || [];
  const pathParams = parameters
    .filter((item) => item.in === "path")
    .map((item) => canonicalResourceKind(item.name));
  const requiredParams = parameters
    .filter((item) => item.required && (item.in === "path" || item.in === "query"))
    .map((item) => canonicalResourceKind(item.name));
  const pathTokens = tokenizeText(operation.path.replace(/[{}]/g, " "));
  const summaryTokens = tokenizeText(operation.summary);
  const descriptionTokens = tokenizeText(operation.description);
  const tagTokens = tokenizeText((operation.tags || []).join(" "));
  const domainTokens = tokenizeText(operation.domain);
  const allTokens = [...pathTokens, ...summaryTokens, ...descriptionTokens, ...tagTokens, ...domainTokens];

  return {
    operation,
    detail,
    method: operation.method,
    path: normalize(operation.path),
    summary: normalize(operation.summary),
    description: normalize(operation.description),
    domain: normalize(operation.domain),
    file: detail?.file || operation.file || "",
    pathTokens: new Set(pathTokens),
    summaryTokens: new Set(summaryTokens),
    descriptionTokens: new Set(descriptionTokens),
    tagTokens: new Set(tagTokens),
    domainTokens: new Set(domainTokens),
    allTokens: new Set(allTokens),
    domains: inferProfileDomains(operation, detail, pathTokens, tagTokens),
    actions: inferProfileActions(operation, detail, allTokens),
    pathParams: new Set(pathParams),
    requiredParams: new Set(requiredParams),
    hasRequestBody: Boolean(detail?.requestBodyTemplate),
  };
}

function addScore(result, points, reason) {
  if (!points) {
    return;
  }
  result.score += points;
  result.reasons.push(reason);
}

function setOverlap(left, right) {
  return [...left].filter((item) => right.has(item));
}

function pathDepth(profile) {
  return profile.path.split("/").filter(Boolean).length;
}

function scoreTextSignals(profile, parsedQuery, result) {
  parsedQuery.effectiveTokens.forEach((token) => {
    if (profile.pathTokens.has(token)) {
      addScore(result, 8, `path token matches "${token}"`);
    } else if (profile.summaryTokens.has(token)) {
      addScore(result, 5, `summary token matches "${token}"`);
    } else if (profile.tagTokens.has(token) || profile.domainTokens.has(token)) {
      addScore(result, 4, `domain/tag token matches "${token}"`);
    } else if (profile.descriptionTokens.has(token)) {
      addScore(result, 2, `description token matches "${token}"`);
    } else if (profile.allTokens.has(token)) {
      addScore(result, 1, `metadata token matches "${token}"`);
    }
  });
}

function scoreDomainSignals(profile, parsedQuery, result) {
  const queryDomains = new Set(parsedQuery.domainIntents || []);
  const matchedDomains = setOverlap(queryDomains, profile.domains);
  matchedDomains.forEach((domain) => addScore(result, 20, `domain intent matches ${domain}`));

  if (queryDomains.has("marketplace") && !profile.domains.has("marketplace")) {
    addScore(result, -34, "marketplace intent excludes non-marketplace endpoint");
  }
  if (!queryDomains.has("marketplace") && profile.domains.has("marketplace")) {
    addScore(result, -5, "marketplace endpoint requires marketplace intent");
  }
  if (queryDomains.has("brc20-prog") && profile.domains.has("brc20") && !profile.domains.has("brc20-prog")) {
    addScore(result, -34, "brc20-prog intent excludes standard brc20 endpoint");
  }
  if (queryDomains.has("brc20") && !queryDomains.has("brc20-prog") && profile.domains.has("brc20-prog")) {
    addScore(result, -24, "standard brc20 intent excludes brc20-prog endpoint");
  }
  if (queryDomains.has("runes") && profile.domains.has("brc20")) {
    addScore(result, -34, "runes intent excludes brc20 endpoint");
  }
  if (queryDomains.has("brc20") && profile.domains.has("runes")) {
    addScore(result, -34, "brc20 intent excludes runes endpoint");
  }
  if (queryDomains.has("runes") && !profile.domains.has("runes")) {
    addScore(result, -34, "runes intent prefers runes endpoint");
  }
  if (queryDomains.has("brc20") && !queryDomains.has("brc20-prog") && !profile.domains.has("brc20")) {
    addScore(result, -18, "brc20 intent prefers brc20 endpoint");
  }
  if (queryDomains.has("fractal") && !profile.domains.has("fractal")) {
    addScore(result, -34, "fractal intent prefers fractal endpoint");
  }
  if (queryDomains.has("alkane") && !profile.domains.has("alkane")) {
    addScore(result, -18, "alkane intent prefers alkane endpoint");
  }
  if (queryDomains.has("collection") && !profile.domains.has("collection")) {
    addScore(result, -18, "collection intent prefers collection endpoint");
  }
  if (queryDomains.has("domain") && !profile.domains.has("domain")) {
    addScore(result, -18, "domain intent prefers domain endpoint");
  }
}

function scoreActionSignals(profile, parsedQuery, result) {
  const queryActions = new Set(parsedQuery.actionIntents || []);
  const matchedActions = setOverlap(queryActions, profile.actions);
  matchedActions.forEach((action) => addScore(result, 10, `action intent matches ${action}`));

  if (queryActions.has("balance") && !profile.actions.has("balance")) {
    addScore(result, -8, "balance intent excludes non-balance endpoint");
  }
  if (queryActions.has("info") && !profile.actions.has("info") && !profile.actions.has("detail") && !profile.actions.has("summary")) {
    addScore(result, -5, "info intent prefers info/detail/summary endpoint");
  }
  if (queryActions.has("history") && !profile.actions.has("history") && !profile.actions.has("kline") && !profile.actions.has("event")) {
    addScore(result, -6, "history intent prefers history/kline/event endpoint");
  }
  if (queryActions.has("list") && !profile.actions.has("list") && !profile.actions.has("all")) {
    addScore(result, -6, "list intent prefers list endpoint");
  }
}

function scoreResourceSignals(profile, parsedQuery, result) {
  const queryResources = new Set((parsedQuery.resourceIntents || []).map(canonicalResourceKind));
  const entityResources = new Set((parsedQuery.entityValues || []).map((item) => canonicalResourceKind(item.kind)));
  const providedResources = new Set([...queryResources, ...entityResources]);
  const matchedPathParams = setOverlap(providedResources, profile.pathParams);

  matchedPathParams.forEach((param) => addScore(result, 16, `provided resource matches path param ${param}`));
  setOverlap(providedResources, profile.requiredParams).forEach((param) => addScore(result, 8, `provided resource satisfies required param ${param}`));

  if (providedResources.has("ticker") && profile.pathParams.has("runeid") && profile.domains.has("runes")) {
    addScore(result, 10, "runes ticker intent can identify runeid endpoint");
  }
  if (providedResources.has("ticker") && profile.pathParams.has("alkaneid") && profile.domains.has("alkane")) {
    addScore(result, 8, "alkane token intent can identify alkaneid endpoint");
  }

  profile.requiredParams.forEach((param) => {
    if (!providedResources.has(param) && ["address", "ticker", "txid", "runeid", "alkaneid", "collectionid", "inscriptionid", "orderid", "blockid"].includes(param)) {
      addScore(result, -16, `missing required business input ${param}`);
    }
  });

  profile.pathParams.forEach((param) => {
    if (!providedResources.has(param) && ["address", "ticker", "txid", "runeid", "alkaneid", "collectionid", "inscriptionid", "orderid", "blockid"].includes(param)) {
      addScore(result, -8, `path-scoped ${param} endpoint without ${param} intent`);
    }
  });
}

function scoreOperationShape(profile, parsedQuery, result) {
  const queryActions = new Set(parsedQuery.actionIntents || []);
  const queryDomains = new Set(parsedQuery.domainIntents || []);

  if (queryActions.has("list") && profile.method === "POST" && profile.domains.has("marketplace")) {
    addScore(result, 4, "marketplace list APIs use POST filters");
  }
  if (queryActions.has("info") && profile.pathParams.size === 0 && profile.actions.has("info")) {
    addScore(result, 2, "general info endpoint has no path parameter burden");
  }
  if (queryActions.has("balance") && queryDomains.size === 0 && profile.domain === "addresses") {
    addScore(result, 10, "generic balance query prefers address domain");
  }
  if (queryActions.has("balance") && queryDomains.size === 0 && profile.domains.has("brc20")) {
    addScore(result, -5, "asset balance endpoint needs asset intent");
  }
  if (queryDomains.has("brc20") && !queryDomains.has("swap") && profile.domains.has("swap")) {
    addScore(result, -16, "plain brc20 query deprioritizes swap endpoint");
  }
  if (queryDomains.has("swap") && profile.domains.has("swap")) {
    addScore(result, 12, "swap intent prefers swap endpoint");
  }
  if (queryActions.has("balance") && profile.actions.has("utxo") && !parsedQuery.effectiveTokens.includes("utxo")) {
    addScore(result, -28, "balance query without utxo intent deprioritizes utxo endpoint");
  }
  if (queryActions.has("status") && profile.actions.has("refund")) {
    addScore(result, -12, "status query should not prefer refund endpoint");
  }
  if (queryActions.has("list") && profile.actions.has("info") && profile.actions.has("list") && !parsedQuery.effectiveTokens.includes("info")) {
    addScore(result, -5, "generic list query deprioritizes specialized info-list endpoint");
  }
  if (queryActions.has("list") && queryDomains.has("marketplace") && profile.path.endsWith("/auction/list")) {
    addScore(result, 8, "generic marketplace list query prefers auction/list endpoint");
  }
  if (queryActions.has("list") && profile.path.includes("statistic_list") && !parsedQuery.effectiveTokens.includes("statistic") && !parsedQuery.effectiveTokens.includes("stats")) {
    addScore(result, -8, "generic list query deprioritizes statistic-list endpoint");
  }
  if (profile.hasRequestBody && queryActions.size === 0 && !queryDomains.has("marketplace") && !queryDomains.has("swap") && !queryDomains.has("inscribe")) {
    addScore(result, -3, "body-based operation needs stronger intent");
  }

  addScore(result, Math.max(0, 6 - Math.floor(pathDepth(profile) / 2)), "shallower endpoint tie-breaker");
}

function scoreMatch(operation, parsedQuery) {
  const profile = buildOperationProfile(operation);
  const result = { score: 0, reasons: [] };

  scoreTextSignals(profile, parsedQuery, result);
  scoreDomainSignals(profile, parsedQuery, result);
  scoreActionSignals(profile, parsedQuery, result);
  scoreResourceSignals(profile, parsedQuery, result);
  scoreOperationShape(profile, parsedQuery, result);

  return result;
}

function findOperations(query) {
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

function findRelatedOperations(apiPath) {
  const detail = getOpenApiDetail(apiPath);
  if (!detail) {
    return {
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
    mode: "list",
    path: detail.path,
    results: related,
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
    rankingNotes.push("selected from ranked interface candidates");
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

function introResolve({ query, apiPath, shell = "powershell", environment = DEFAULT_OPENAPI_ENVIRONMENT, top = 5 }) {
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
    queryPayload = findOperations(query);
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

  const paramsPayload = buildParamsPayload(selectedPath);
  const examplePayload = buildExamplePayload(selectedPath, shell, environment);
  const relatedPayload = findRelatedOperations(selectedPath);
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
    environment,
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
      environment: examplePayload.environment,
      command: shouldReturnAmbiguous ? "" : examplePayload.example,
    },
    alternatives,
  };
}

module.exports = {
  introResolve,
  introShow,
};
