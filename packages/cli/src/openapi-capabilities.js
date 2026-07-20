const path = require("path");
const {
  collectPathBlocks,
  extractMethods,
  extractScalar,
  extractTags,
  getOpenApiDetail,
  getSwaggerContext,
} = require("./openapi-utils");
const { CAPABILITY_OVERRIDES } = require("./openapi-capability-overrides");

let capabilityCache = null;

function normalizeToken(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function inferDomainFromPath(apiPath, file, tags = []) {
  const text = `${apiPath} ${file} ${tags.join(" ")}`.toLowerCase();
  if (text.includes("brc20-swap")) return "brc20-swap";
  if (text.includes("brc20")) return "brc20";
  if (text.includes("runes")) return "runes";
  if (text.includes("alkanes")) return "alkanes";
  if (text.includes("collection")) return "collection";
  if (text.includes("domain")) return "domain";
  if (text.includes("market")) return "marketplace";
  if (text.includes("address")) return "address";
  if (text.includes("tx") || text.includes("transaction") || text.includes("rawtx")) return "transaction";
  if (text.includes("block") || text.includes("height") || text.includes("fees")) return "chain";
  if (text.includes("price")) return "price";
  return tags[0] ? tags[0].toLowerCase().replace(/[^a-z0-9]+/g, "-") : "general";
}

function inferAction(method, apiPath) {
  const upperMethod = String(method || "").toUpperCase();
  const normalizedPath = apiPath.toLowerCase();
  if (upperMethod === "GET") return "read";
  if (normalizedPath.includes("pushtx") || normalizedPath.includes("broadcast")) return "broadcast";
  if (normalizedPath.includes("swap")) return "swap";
  if (normalizedPath.includes("add") || normalizedPath.includes("create") || normalizedPath.includes("commit")) return "write";
  return "write";
}

function inferSideEffect(action, method) {
  if (action === "read" && String(method).toUpperCase() === "GET") return "none";
  if (action === "broadcast") return "broadcast_transaction";
  return "state_change";
}

function canonicalEntityName(name) {
  const normalized = normalizeToken(name);
  if (normalized === "blockid") return "blockHash";
  if (normalized === "inscriptionid") return "inscriptionId";
  if (normalized === "collectionid") return "collectionId";
  if (normalized === "orderid") return "orderId";
  if (normalized === "runeid") return "runeid";
  if (normalized === "alkaneid") return "alkaneid";
  if (normalized === "tick" || normalized === "ticker" || normalized === "token") return "ticker";
  if (normalized === "txhex") return "txHex";
  if (normalized === "txshex") return "txsHex";
  return normalized;
}

function inferRequiredEntities(detail, override = {}) {
  if (override.requiredEntities) return override.requiredEntities;
  return (detail.parameters || [])
    .filter((parameter) => parameter.required && (parameter.in === "path" || parameter.in === "query"))
    .map((parameter) => canonicalEntityName(parameter.name));
}

function inferResource(apiPath, summary, domain) {
  const text = `${apiPath} ${summary}`.toLowerCase();
  if (text.includes("recommended") && text.includes("fee")) return "chainFees";
  if (text.includes("price")) return "btcPrice";
  if (text.includes("available-utxo")) return "availableUtxos";
  if (text.includes("available-balance")) return "addressAvailableBalance";
  if (text.includes("balance")) return "addressBalance";
  if (text.includes("history")) return `${domain}History`;
  if (text.includes("rawtx")) return "rawTransaction";
  if (text.includes("/tx/") && text.includes("/ins")) return "transactionInputs";
  if (text.includes("/tx/") && text.includes("/outs")) return "transactionOutputs";
  if (text.includes("/tx/")) return "transaction";
  if (text.includes("/block/") && text.includes("/txs")) return "blockTransactions";
  if (text.includes("block")) return "block";
  return domain;
}

function buildFallbackIntent(action, domain, resource) {
  const resourceToken = String(resource || domain || "operation").replace(/^[A-Z]/, (char) => char.toLowerCase());
  return `${action}.${domain}.${resourceToken}`.replace(/[^a-zA-Z0-9.]+/g, "");
}

function buildCapability(operation) {
  const detail = getOpenApiDetail(operation.path) || operation;
  const override = CAPABILITY_OVERRIDES[operation.path] || {};
  const curated = Object.hasOwn(CAPABILITY_OVERRIDES, operation.path);
  const method = String(detail.method || operation.method || "").toUpperCase();
  const domain = override.domain || inferDomainFromPath(operation.path, operation.file, operation.tags || []);
  const action = override.action || inferAction(method, operation.path);
  const resource = override.resource || inferResource(operation.path, operation.summary, domain);
  const sideEffect = override.sideEffect || inferSideEffect(action, method);

  return {
    operationId: detail.operationId,
    method,
    path: operation.path,
    file: operation.file,
    summary: operation.summary,
    description: operation.description,
    tags: operation.tags || [],
    parameters: detail.parameters || [],
    requestBodyTemplate: detail.requestBodyTemplate,
    servers: detail.servers,
    capabilitySource: curated ? "curated" : "inferred",
    capabilityConfidence: curated ? "high" : "low",
    capability: {
      intent: override.intent || buildFallbackIntent(action, domain, resource),
      action,
      resource,
      domain,
      sideEffect,
      environments: override.environments || ["bitcoin", "fractal"],
      requiredEntities: inferRequiredEntities(detail, override),
      optionalEntities: override.optionalEntities || [],
      defaultQueryParams: override.defaultQueryParams || {},
      parameterEntityMap: override.parameterEntityMap || {},
    },
    agentUsage: {
      useWhen: override.useWhen || [],
      doNotUseWhen: override.doNotUseWhen || [],
    },
  };
}

function listOpenApiCapabilities() {
  if (capabilityCache) return capabilityCache;

  const { openapiSwaggerDir, swaggerDir } = getSwaggerContext();
  capabilityCache = collectPathBlocks(swaggerDir).flatMap((block) => {
    const methods = extractMethods(block.blockLines);
    return methods.map((method) => buildCapability({
      path: block.path,
      method,
      file: path.relative(openapiSwaggerDir, block.filePath),
      operationId: extractScalar(block.blockLines, /^\s{6}operationId:\s+/),
      summary: extractScalar(block.blockLines, /^\s{6}summary:\s+/),
      description: extractScalar(block.blockLines, /^\s{6}description:\s+/),
      tags: extractTags(block.blockLines),
    }));
  });

  return capabilityCache;
}

function getOpenApiCapability(apiPath) {
  return listOpenApiCapabilities().find((capability) => capability.path === apiPath) || null;
}

module.exports = {
  getOpenApiCapability,
  listOpenApiCapabilities,
};
