import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  introResolve,
  introShow,
} = require("../packages/cli");
const {
  collectPathBlocks,
  extractMethods,
  extractScalar,
  extractTags,
  getOpenApiDetail,
  getSwaggerContext,
} = require("../packages/cli/src/openapi-utils");

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = new Set(process.argv.slice(2));
const strict = args.has("--strict");
const full = args.has("--full");
const jsonOutput = args.has("--json");
const failuresLimitArg = process.argv.find((item) => item.startsWith("--failures="));
const failuresLimit = failuresLimitArg ? Number(failuresLimitArg.split("=")[1]) : 30;
const top = 10;

const thresholds = {
  directPathTop1: 1,
  structuredPlannerOperationId: 1,
};

const structuredPlannerCases = [
  {
    id: "planner-chain-fees",
    input: {
      intent: "read.chain.recommendedFees",
      action: "read",
      resource: "chainFees",
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/indexer/fees/recommended",
    expectedMethod: "GET",
    expectedMode: "planned",
  },
  {
    id: "planner-block-transactions",
    input: {
      intent: "read.block.transactions",
      action: "read",
      resource: "blockTransactions",
      entities: { height: 100 },
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/indexer/block/{height}/txs",
    expectedMethod: "GET",
    expectedMode: "planned",
  },
  {
    id: "planner-missing-address",
    input: {
      intent: "read.address.balance",
      action: "read",
      resource: "addressBalance",
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/indexer/address/{address}/balance",
    expectedMethod: "GET",
    expectedMode: "missing_required_entities",
  },
  {
    id: "planner-address-brc20-summary",
    input: {
      intent: "read.address.brc20Summary",
      action: "read",
      resource: "addressBrc20Summary",
      entities: { address: "bc1qd9xssumrs8kj0u0uznwc5zelwydrlapkcvjp3z" },
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/indexer/address/{address}/brc20/summary",
    expectedMethod: "GET",
    expectedMode: "planned",
  },
  {
    id: "planner-chain-info",
    input: {
      intent: "read.chain.info",
      action: "read",
      resource: "chainInfo",
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/indexer/blockchain/info",
    expectedMethod: "GET",
    expectedMode: "planned",
  },
  {
    id: "planner-btc-price",
    input: {
      intent: "read.chain.btcPrice",
      action: "read",
      resource: "btcPrice",
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/price/btc",
    expectedMethod: "GET",
    expectedMode: "planned",
  },
  {
    id: "planner-block-by-height",
    input: {
      intent: "read.block.byHeight",
      action: "read",
      resource: "block",
      entities: { height: 100 },
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/indexer/height/{height}/block",
    expectedMethod: "GET",
    expectedMode: "planned",
  },
  {
    id: "planner-block-by-hash",
    input: {
      intent: "read.block.byHash",
      action: "read",
      resource: "block",
      entities: { blockHash: "000000000000000000011e9082f29fadb888c3f1e85c696138091bab3cce9737" },
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/indexer/block/id/{blockid}",
    expectedMethod: "GET",
    expectedMode: "planned",
  },
  {
    id: "planner-tx-detail",
    input: {
      intent: "read.transaction.detail",
      action: "read",
      resource: "transaction",
      entities: { txid: "6d60f589667778cc6e7c59ea0af29db97dd691386b64947b5abed69aaf151a27" },
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/indexer/tx/{txid}",
    expectedMethod: "GET",
    expectedMode: "planned",
  },
  {
    id: "planner-raw-tx",
    input: {
      intent: "read.transaction.raw",
      action: "read",
      resource: "rawTransaction",
      entities: { txid: "6d60f589667778cc6e7c59ea0af29db97dd691386b64947b5abed69aaf151a27" },
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/indexer/rawtx/{txid}",
    expectedMethod: "GET",
    expectedMode: "planned",
  },
  {
    id: "planner-tx-inputs",
    input: {
      intent: "read.transaction.inputs",
      action: "read",
      resource: "transactionInputs",
      entities: { txid: "6d60f589667778cc6e7c59ea0af29db97dd691386b64947b5abed69aaf151a27" },
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/indexer/tx/{txid}/ins",
    expectedMethod: "GET",
    expectedMode: "planned",
  },
  {
    id: "planner-tx-outputs",
    input: {
      intent: "read.transaction.outputs",
      action: "read",
      resource: "transactionOutputs",
      entities: { txid: "6d60f589667778cc6e7c59ea0af29db97dd691386b64947b5abed69aaf151a27" },
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/indexer/tx/{txid}/outs",
    expectedMethod: "GET",
    expectedMode: "planned",
  },
  {
    id: "planner-address-balance",
    input: {
      intent: "read.address.balance",
      action: "read",
      resource: "addressBalance",
      entities: { address: "bc1qd9xssumrs8kj0u0uznwc5zelwydrlapkcvjp3z" },
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/indexer/address/{address}/balance",
    expectedMethod: "GET",
    expectedMode: "planned",
  },
  {
    id: "planner-address-available-balance",
    input: {
      intent: "read.address.availableBalance",
      action: "read",
      resource: "addressAvailableBalance",
      entities: { address: "bc1qd9xssumrs8kj0u0uznwc5zelwydrlapkcvjp3z" },
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/indexer/address/{address}/available-balance",
    expectedMethod: "GET",
    expectedMode: "planned",
  },
  {
    id: "planner-address-available-utxos",
    input: {
      intent: "read.address.availableUtxos",
      action: "read",
      resource: "availableUtxos",
      entities: { address: "bc1qd9xssumrs8kj0u0uznwc5zelwydrlapkcvjp3z" },
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/indexer/address/{address}/available-utxo-data",
    expectedMethod: "GET",
    expectedMode: "planned",
  },
  {
    id: "planner-address-history",
    input: {
      intent: "read.address.history",
      action: "read",
      resource: "addressHistory",
      entities: { address: "bc1qd9xssumrs8kj0u0uznwc5zelwydrlapkcvjp3z" },
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/indexer/address/{address}/history",
    expectedMethod: "GET",
    expectedMode: "planned",
  },
  {
    id: "planner-brc20-classic-ordi-info",
    input: {
      task: "查询 brc20 的 ordi 信息",
      intent: "read.brc20.tickerInfo",
      action: "read",
      resource: "brc20TickerInfo",
      environment: "bitcoin",
      entities: { ticker: "ordi" },
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/indexer/brc20/{ticker}/info",
    expectedMethod: "GET",
    expectedMode: "planned",
  },
  {
    id: "planner-brc20-prog-six-char-info",
    input: {
      intent: "read.brc20Prog.tickerInfo",
      action: "read",
      resource: "brc20ProgTickerInfo",
      environment: "bitcoin",
      entities: { ticker: "abcdef" },
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/indexer/brc20-prog/{ticker}/info",
    expectedMethod: "GET",
    expectedMode: "planned",
  },
  {
    id: "planner-brc20-swap-history-fractal",
    input: {
      task: "查 inswap swap history",
      intent: "read.brc20Swap.swapHistory",
      action: "read",
      resource: "brc20SwapHistory",
      environment: "fractal",
      entities: { address: "bc1qd9xssumrs8kj0u0uznwc5zelwydrlapkcvjp3z" },
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/brc20-swap/swap_history",
    expectedMethod: "GET",
    expectedMode: "planned",
  },
  {
    id: "planner-inscription-info-by-number",
    input: {
      intent: "read.inscription.info",
      action: "read",
      resource: "inscriptionInfo",
      environment: "bitcoin",
      entities: { inscriptionNumber: 12345 },
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/indexer/inscription/info/{inscriptionId}",
    expectedMethod: "GET",
    expectedMode: "planned",
    expectedPathParams: { inscriptionId: 12345 },
  },
  {
    id: "planner-best-height",
    input: {
      intent: "read.chain.bestHeight",
      action: "read",
      resource: "bestHeight",
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/indexer/brc20-prog/bestheight",
    expectedMethod: "GET",
    expectedMode: "planned",
  },
  {
    id: "planner-broadcast-confirmation",
    input: {
      intent: "write.transaction.broadcast",
      action: "broadcast",
      resource: "rawTransactionBroadcast",
      entities: { txHex: "01000000" },
    },
    expectedPath: "/v1/indexer/local_pushtx",
    expectedMethod: "POST",
    expectedMode: "confirmation_required",
    expectedBody: { txHex: "01000000" },
  },
  {
    id: "planner-readonly-excludes-broadcast",
    input: {
      intent: "write.transaction.broadcast",
      action: "read",
      resource: "rawTransactionBroadcast",
      entities: { txHex: "01000000" },
      preferences: { readOnlyOnly: true },
    },
    expectedPath: "/v1/indexer/local_pushtx",
    expectedMethod: "POST",
    expectedMode: "unsafe_intent_mismatch",
  },
];

const curatedCases = [
  {
    id: "inscription-info-by-id",
    query: "get inscription info by inscription id",
    expectedPath: "/v1/indexer/inscription/info/{inscriptionId}",
    expectedMethod: "get",
  },
  {
    id: "collection-market-inscription-info",
    query: "get collection marketplace inscription info",
    expectedPath: "/v3/market/collection/auction/inscription_info",
    expectedMethod: "post",
  },
  {
    id: "brc20-swap-add-liq",
    query: "brc20 swap add liquidity",
    expectedPath: "/v1/brc20-swap/add_liq",
    expectedMethod: "post",
  },
  {
    id: "brc20-swap-remove-liq",
    query: "brc20 swap remove liquidity",
    expectedPath: "/v1/brc20-swap/remove_liq",
    expectedMethod: "post",
  },
  {
    id: "brc20-swap-pre-batch-send",
    query: "brc20 swap pre batch send",
    expectedPath: "/v1/brc20-swap/pre_batch_send",
    expectedMethod: "post",
  },
  {
    id: "brc20-info",
    query: "get brc20 ticker info",
    expectedPath: "/v1/indexer/brc20/{ticker}/info",
    expectedMethod: "get",
  },
  {
    id: "brc20-holder-list",
    query: "list brc20 holders by ticker",
    expectedPath: "/v1/indexer/brc20/{ticker}/holders",
    expectedMethod: "get",
  },
  {
    id: "address-balance",
    query: "get address bitcoin balance",
    expectedPath: "/v1/indexer/address/{address}/balance",
    expectedMethod: "get",
  },
  {
    id: "address-inscription-list",
    query: "list inscriptions for address",
    expectedPath: "/v1/indexer/address/{address}/inscription-data",
    expectedMethod: "get",
  },
  {
    id: "runes-info",
    query: "get runes rune info",
    expectedPath: "/v1/indexer/runes/{runeid}/info",
    expectedMethod: "get",
  },
  {
    id: "runes-holder-list",
    query: "list runes holders by rune id",
    expectedPath: "/v1/indexer/runes/{runeid}/holders",
    expectedMethod: "get",
  },
  {
    id: "runes-market-list",
    query: "list runes marketplace orders",
    expectedPath: "/v3/market/runes/auction/list",
    expectedMethod: "post",
  },
  {
    id: "brc20-market-list",
    query: "list brc20 marketplace orders",
    expectedPath: "/v3/market/brc20/auction/list",
    expectedMethod: "post",
  },
  {
    id: "collection-market-list",
    query: "list collection marketplace orders",
    expectedPath: "/v3/market/collection/auction/list",
    expectedMethod: "post",
  },
  {
    id: "domain-market-list",
    query: "list domain marketplace orders",
    expectedPath: "/v3/market/domain/auction/list",
    expectedMethod: "post",
  },
  {
    id: "alkanes-info",
    query: "get alkane info by alkane id",
    expectedPath: "/v1/indexer/alkanes/{alkaneid}/info",
    expectedMethod: "get",
  },
  {
    id: "alkanes-market-list",
    query: "list alkanes marketplace orders",
    expectedPath: "/v3/market/alkanes/auction/list",
    expectedMethod: "post",
  },
  {
    id: "price-btc",
    query: "get btc price",
    expectedPath: "/v1/price/btc",
    expectedMethod: "get",
  },
  {
    id: "blockchain-block-height",
    query: "get blockchain block height",
    expectedPath: "/v1/indexer/blockchain/info",
    expectedMethod: "get",
  },
  {
    id: "transaction-info",
    query: "get transaction info by txid",
    expectedPath: "/v1/indexer/tx/{txid}",
    expectedMethod: "get",
  },
  {
    id: "fractal-inscription-info",
    query: "fractal inscription info by inscription id",
    expectedPath: "/v1/indexer/inscription/info/{inscriptionId}",
    expectedMethod: "get",
    environment: "fractal",
  },
];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function firstWords(value, limit) {
  return normalizeText(value).split(/\s+/).filter(Boolean).slice(0, limit);
}

function pathTokens(apiPath) {
  return normalizeText(apiPath.replace(/[{}]/g, " "))
    .split(/\s+/)
    .filter((token) => token && !["v1", "v2", "v3"].includes(token));
}

function resourceHints(detail) {
  const parameters = detail.parameters || [];
  const required = parameters.filter((item) => item.required && (item.in === "path" || item.in === "query"));
  return required.map((item) => item.name);
}

function operationDomain(operation) {
  const fileBase = path.basename(operation.file || "", ".yaml");
  const tag = operation.tags?.[0] || "";
  return normalizeText(`${fileBase} ${tag}`).split(/\s+/).filter(Boolean).slice(0, 4);
}

function buildGeneratedQuery(operation) {
  const detail = getOpenApiDetail(operation.path) || operation;
  const tokens = unique([
    ...operationDomain(operation),
    ...pathTokens(operation.path),
    ...firstWords(operation.summary, 8),
    ...resourceHints(detail),
  ]);
  return tokens.slice(0, 18).join(" ");
}

function listOperations() {
  const { openapiSwaggerDir, swaggerDir } = getSwaggerContext();
  return collectPathBlocks(swaggerDir).flatMap((block) => {
    const methods = extractMethods(block.blockLines);
    return methods.map((method) => ({
      path: block.path,
      method,
      file: path.relative(openapiSwaggerDir, block.filePath),
      operationId: extractScalar(block.blockLines, /^\s{6}operationId:\s+/),
      summary: extractScalar(block.blockLines, /^\s{6}summary:\s+/),
      description: extractScalar(block.blockLines, /^\s{6}description:\s+/),
      tags: extractTags(block.blockLines),
    }));
  });
}

function candidatePaths(payload) {
  return unique([
    payload?.selected?.path,
    ...(payload?.alternatives || []).map((item) => item.path),
  ]);
}

function rankOfPath(payload, expectedPath) {
  const paths = candidatePaths(payload);
  const index = paths.indexOf(expectedPath);
  return index === -1 ? null : index + 1;
}

function makeEmptyStats() {
  return {
    total: 0,
    top1: 0,
    top3: 0,
    top10: 0,
    method: 0,
    operationId: 0,
    failures: [],
  };
}

function addCaseResult(stats, result) {
  stats.total += 1;
  if (result.rank === 1) stats.top1 += 1;
  if (result.rank !== null && result.rank <= 3) stats.top3 += 1;
  if (result.rank !== null && result.rank <= 10) stats.top10 += 1;
  if (result.methodMatch) stats.method += 1;
  if (result.operationIdMatch) stats.operationId += 1;
  if (result.rank !== 1) stats.failures.push(result);
}

function ratio(part, total) {
  return total === 0 ? 1 : part / total;
}

function percent(part, total) {
  return `${(ratio(part, total) * 100).toFixed(2)}%`;
}

function objectIncludes(actual, expected) {
  return Object.entries(expected || {}).every(([key, value]) => JSON.stringify(actual?.[key]) === JSON.stringify(value));
}

function evaluateDirectPath(operations) {
  const stats = makeEmptyStats();
  operations.forEach((operation) => {
    const expectedDetail = introShow(operation.path);
    let payload = null;
    let rank = 1;
    let actualPath = expectedDetail.path;
    let actualMethod = expectedDetail.method;
    let actualOperationId = expectedDetail.operationId;
    let mode = expectedDetail.mode;
    let confidence = "direct";

    if (full) {
      payload = introResolve({ apiPath: operation.path, shell: "bash", environment: "bitcoin", top });
      rank = payload?.selected?.path === operation.path ? 1 : null;
      actualPath = payload?.selected?.path || "";
      actualMethod = payload?.selected?.method || "";
      actualOperationId = payload?.selected?.operationId || "";
      mode = payload?.mode;
      confidence = payload?.match?.confidence;
    }

    addCaseResult(stats, {
      id: `direct:${operation.path}`,
      query: "",
      expectedPath: operation.path,
      actualPath,
      rank,
      methodMatch: actualMethod === operation.method,
      operationIdMatch: actualOperationId === expectedDetail.operationId,
      mode,
      confidence,
    });
  });
  return stats;
}

function selectGeneratedQueryOperations(operations) {
  if (full) {
    return operations;
  }

  const byFile = new Map();
  operations.forEach((operation) => {
    if (!byFile.has(operation.file)) {
      byFile.set(operation.file, []);
    }
    byFile.get(operation.file).push(operation);
  });

  const selected = [];
  Array.from(byFile.values()).forEach((items) => {
    selected.push(...items.slice(0, 1));
  });

  curatedCases.forEach((testCase) => {
    const operation = operations.find((item) => item.path === testCase.expectedPath);
    if (operation && !selected.some((item) => item.path === operation.path)) {
      selected.push(operation);
    }
  });

  return selected;
}

function evaluateGeneratedQueries(operations) {
  const stats = makeEmptyStats();
  selectGeneratedQueryOperations(operations).forEach((operation) => {
    const query = buildGeneratedQuery(operation);
    const expectedDetail = introShow(operation.path);
    const payload = introResolve({ query, shell: "bash", environment: "bitcoin", top });
    const rank = rankOfPath(payload, operation.path);
    addCaseResult(stats, {
      id: `generated:${operation.path}`,
      query,
      expectedPath: operation.path,
      expectedMethod: operation.method,
      actualPath: payload?.selected?.path || "",
      actualMethod: payload?.selected?.method || "",
      rank,
      methodMatch: rank !== null && payload?.selected?.method === operation.method,
      operationIdMatch: rank !== null && payload?.selected?.operationId === expectedDetail.operationId,
      mode: payload?.mode,
      confidence: payload?.match?.confidence,
      score: payload?.match?.score,
    });
  });
  return stats;
}

function evaluateCuratedCases(existingPaths) {
  const stats = makeEmptyStats();
  const skipped = [];
  curatedCases.forEach((testCase) => {
    if (!existingPaths.has(testCase.expectedPath)) {
      skipped.push({ id: testCase.id, expectedPath: testCase.expectedPath, reason: "expected path not found" });
      return;
    }
    const expectedDetail = introShow(testCase.expectedPath);
    const payload = introResolve({
      query: testCase.query,
      shell: "bash",
      environment: testCase.environment || "bitcoin",
      top,
    });
    const rank = rankOfPath(payload, testCase.expectedPath);
    addCaseResult(stats, {
      id: testCase.id,
      query: testCase.query,
      expectedPath: testCase.expectedPath,
      expectedMethod: testCase.expectedMethod,
      actualPath: payload?.selected?.path || "",
      actualMethod: payload?.selected?.method || "",
      rank,
      methodMatch: rank !== null && payload?.selected?.method === testCase.expectedMethod,
      operationIdMatch: rank !== null && payload?.selected?.operationId === expectedDetail.operationId,
      mode: payload?.mode,
      confidence: payload?.match?.confidence,
      score: payload?.match?.score,
    });
  });
  stats.skipped = skipped;
  return stats;
}

function evaluateStructuredPlannerCases(existingPaths) {
  const stats = makeEmptyStats();
  const skipped = [];
  structuredPlannerCases.forEach((testCase) => {
    if (!existingPaths.has(testCase.expectedPath)) {
      skipped.push({ id: testCase.id, expectedPath: testCase.expectedPath, reason: "expected path not found" });
      return;
    }
    const expectedDetail = introShow(testCase.expectedPath);
    const payload = introResolve({
      ...testCase.input,
      shell: "bash",
      environment: testCase.input.environment || "bitcoin",
      top,
    });
    const actualPath = payload?.selected?.path || "";
    const rank = actualPath === testCase.expectedPath ? 1 : rankOfPath(payload, testCase.expectedPath);
    const modeMatch = payload?.mode === testCase.expectedMode;
    const bodyMatch = testCase.expectedBody ? objectIncludes(payload?.bindings?.body, testCase.expectedBody) : true;
    const pathParamsMatch = testCase.expectedPathParams ? objectIncludes(payload?.bindings?.pathParams, testCase.expectedPathParams) : true;
    const methodMatch = actualPath === testCase.expectedPath && payload?.selected?.method === testCase.expectedMethod;
    const result = {
      id: testCase.id,
      query: testCase.input.intent,
      expectedPath: testCase.expectedPath,
      expectedMethod: testCase.expectedMethod,
      actualPath,
      actualMethod: payload?.selected?.method || "",
      rank,
      methodMatch,
      bodyMatch,
      pathParamsMatch,
      operationIdMatch: actualPath === testCase.expectedPath && payload?.selected?.operationId === expectedDetail.operationId && modeMatch && bodyMatch && pathParamsMatch,
      mode: payload?.mode,
      confidence: payload?.match?.confidence,
      score: payload?.match?.score,
    };
    addCaseResult(stats, result);
    if ((!modeMatch || !bodyMatch || !pathParamsMatch) && !stats.failures.includes(result)) {
      stats.failures.push(result);
    }
  });
  stats.skipped = skipped;
  return stats;
}

function evaluateSchema(operations) {
  const missingOperationIds = operations.filter((item) => !item.operationId).map((item) => ({ path: item.path, method: item.method, file: item.file }));
  const byOperationId = new Map();
  operations.forEach((operation) => {
    if (!operation.operationId) return;
    if (!byOperationId.has(operation.operationId)) byOperationId.set(operation.operationId, []);
    byOperationId.get(operation.operationId).push(operation);
  });
  const duplicateOperationIds = Array.from(byOperationId.entries())
    .filter(([, items]) => items.length > 1)
    .map(([operationId, items]) => ({ operationId, occurrences: items.map((item) => ({ path: item.path, method: item.method, file: item.file })) }));

  return {
    operationCount: operations.length,
    missingOperationIds,
    duplicateOperationIds,
  };
}

function summarizeStats(stats) {
  return {
    total: stats.total,
    top1: stats.top1,
    top1Rate: percent(stats.top1, stats.total),
    top3: stats.top3,
    top3Rate: percent(stats.top3, stats.total),
    top10: stats.top10,
    top10Rate: percent(stats.top10, stats.total),
    method: stats.method,
    methodRate: percent(stats.method, stats.total),
    operationId: stats.operationId,
    operationIdRate: percent(stats.operationId, stats.total),
  };
}

function summarizePlannerStats(stats) {
  return {
    total: stats.total,
    top1: stats.top1,
    top1Rate: percent(stats.top1, stats.total),
    method: stats.method,
    methodRate: percent(stats.method, stats.total),
    operationId: stats.operationId,
    operationIdRate: percent(stats.operationId, stats.total),
    failedModes: stats.failures.map((item) => ({ id: item.id, mode: item.mode })),
  };
}

function printStats(title, stats) {
  console.log(`\n${title}`);
  console.log(`- total: ${stats.total}`);
  console.log(`- top1: ${stats.top1}/${stats.total} (${percent(stats.top1, stats.total)})`);
  console.log(`- top3: ${stats.top3}/${stats.total} (${percent(stats.top3, stats.total)})`);
  console.log(`- top10: ${stats.top10}/${stats.total} (${percent(stats.top10, stats.total)})`);
  console.log(`- method: ${stats.method}/${stats.total} (${percent(stats.method, stats.total)})`);
  console.log(`- operationId: ${stats.operationId}/${stats.total} (${percent(stats.operationId, stats.total)})`);
  if (stats.skipped?.length) {
    console.log(`- skipped: ${stats.skipped.length}`);
  }
}

function printFailures(title, failures) {
  const shown = failures.slice(0, failuresLimit);
  if (shown.length === 0) return;
  console.log(`\n${title} failures, showing ${shown.length}/${failures.length}`);
  shown.forEach((failure) => {
    console.log(`- ${failure.id}`);
    if (failure.query) console.log(`  query: ${failure.query}`);
    console.log(`  expected: ${failure.expectedPath}`);
    console.log(`  actual: ${failure.actualPath || "<none>"}`);
    console.log(`  rank: ${failure.rank ?? "not in top10"}, mode: ${failure.mode || ""}, confidence: ${failure.confidence || ""}, score: ${failure.score ?? ""}`);
  });
}

function thresholdFailures(stats) {
  const failures = [];
  if (ratio(stats.directPath.top1, stats.directPath.total) < thresholds.directPathTop1) {
    failures.push(`direct path top1 below ${thresholds.directPathTop1}`);
  }
  if (stats.schema.missingOperationIds.length > 0) {
    failures.push("schema has missing operationId values");
  }
  if (stats.schema.duplicateOperationIds.length > 0) {
    failures.push("schema has duplicate operationId values");
  }
  if (stats.structuredPlanner && ratio(stats.structuredPlanner.operationId, stats.structuredPlanner.total) < thresholds.structuredPlannerOperationId) {
    failures.push("structured planner cases must all match expected path, method, operationId, and mode");
  }
  if (stats.structuredPlanner?.skipped?.length) {
    failures.push("some structured planner cases reference missing paths");
  }
  return failures;
}

function main() {
  process.chdir(rootDir);
  const operations = listOperations();
  const existingPaths = new Set(operations.map((item) => item.path));
  const schema = evaluateSchema(operations);
  const directPath = evaluateDirectPath(operations);
  const structuredPlanner = evaluateStructuredPlannerCases(existingPaths);
  const stats = { schema, directPath, structuredPlanner };
  const failures = thresholdFailures(stats);

  if (jsonOutput) {
    console.log(JSON.stringify({
      mode: full ? "full" : "sampled",
      thresholds,
      schema,
      directPath: summarizeStats(directPath),
      structuredPlanner: summarizePlannerStats(structuredPlanner),
      failures,
      structuredPlannerFailures: structuredPlanner.failures,
      skippedStructuredPlannerCases: structuredPlanner.skipped,
    }, null, 2));
  } else {
    console.log("resolve_api structured planner regression report");
    console.log(`mode: ${full ? "full" : "sampled"}`);
    console.log(`swagger operations: ${schema.operationCount}`);
    console.log(`missing operationId: ${schema.missingOperationIds.length}`);
    console.log(`duplicate operationId: ${schema.duplicateOperationIds.length}`);
    printStats("Direct path coverage", directPath);
    printStats("Structured planner coverage", structuredPlanner);
    printFailures("Structured planner", structuredPlanner.failures);
    if (failures.length > 0) {
      console.log("\nThreshold failures");
      failures.forEach((failure) => console.log(`- ${failure}`));
    } else {
      console.log("\nAll thresholds passed");
    }
  }

  if (strict && failures.length > 0) {
    process.exit(1);
  }
}

main();
