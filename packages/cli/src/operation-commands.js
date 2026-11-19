const path = require("path");
const { creditsOperation } = require("./credits");
const { isReadOnly, requiresConfirmation, requestBodySummary } = require("./operation-policy");
const {
  collectPathBlocks,
  extractMethods,
  extractParameters,
  extractScalar,
  extractServers,
  extractTags,
  extractUnisatExtensions,
  getSwaggerContext,
} = require("./openapi-utils");

function fallbackOperationId(method, apiPath) {
  const suffix = apiPath
    .replace(/^\/+/, "")
    .replace(/\{([^}]+)\}/g, "$1")
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "");
  return `${method.toLowerCase()}${suffix ? suffix.charAt(0).toUpperCase() + suffix.slice(1) : "Root"}`;
}

function normalizeFilePath(filePath, context) {
  if (context.embedded) {
    return filePath.replace(/\\/g, "/");
  }
  return path.relative(context.openapiSwaggerDir, filePath).replace(/\\/g, "/");
}

function domainFromFile(file) {
  return file
    .replace(/\.ya?ml$/i, "")
    .replace(/-indexer$/i, "")
    .replace(/-api$/i, "");
}

function parameterSummary(parameters) {
  return {
    pathRequired: parameters.filter((parameter) => parameter.in === "path" && parameter.required).map((parameter) => parameter.name),
    queryRequired: parameters.filter((parameter) => parameter.in === "query" && parameter.required).map((parameter) => parameter.name),
    queryOptional: parameters.filter((parameter) => parameter.in === "query" && !parameter.required).map((parameter) => parameter.name),
  };
}

function buildOperationFromBlock(block, context) {
  const methods = extractMethods(block.blockLines);
  const method = methods[0] || "";
  const file = normalizeFilePath(block.filePath, context);
  const operationId = extractScalar(block.blockLines, /^\s{6}operationId:\s+/) || fallbackOperationId(method, block.path);
  const parameters = extractParameters(block.blockLines);
  const unisat = extractUnisatExtensions(block.blockLines);

  const status = unisat["x-unisat-status"];
  const recommendation = status === "not-recommended" ? { recommendation: status } : {};

  return {
    commandName: operationId,
    operationId,
    method,
    path: block.path,
    file,
    domain: domainFromFile(file),
    tags: extractTags(block.blockLines),
    summary: extractScalar(block.blockLines, /^\s{6}summary:\s+/),
    description: extractScalar(block.blockLines, /^\s{6}description:\s+/),
    ...recommendation,
    unisat,
    parameters,
    parametersSummary: parameterSummary(parameters),
    requestBody: requestBodySummary(block.blockLines, block.fileLines),
    servers: extractServers(block.fileLines),
    readOnly: isReadOnly(method, unisat),
    requiresApiKey: true,
    requiresConfirmation: requiresConfirmation(method, unisat),
  };
}

function normalizeFilterValue(value) {
  return String(value).toLowerCase();
}

function extensionMatches(operation, extensionName, expected) {
  if (expected === undefined) {
    return true;
  }
  const actual = operation.unisat?.[`x-unisat-${extensionName}`];
  if (Array.isArray(actual)) {
    return actual.some((item) => normalizeFilterValue(item) === normalizeFilterValue(expected));
  }
  if (typeof actual === "boolean") {
    return String(actual) === String(expected);
  }
  return actual !== undefined && normalizeFilterValue(actual) === normalizeFilterValue(expected);
}

function listOperationCommands(filters = {}) {
  const context = getSwaggerContext();
  const blocks = collectPathBlocks(context.swaggerDir);
  return [creditsOperation, ...blocks.map((block) => buildOperationFromBlock(block, context))]
    .filter((operation) => operation.unisat?.["x-unisat-status"] !== "deprecated")
    .filter((operation) => !filters.domain || operation.domain === filters.domain)
    .filter((operation) => !filters.file || operation.file === filters.file)
    .filter((operation) => !filters.method || operation.method.toLowerCase() === String(filters.method).toLowerCase())
    .filter((operation) => !filters.tag || operation.tags.some((tag) => tag.toLowerCase() === String(filters.tag).toLowerCase()))
    .filter((operation) => extensionMatches(operation, "domain", filters["unisat-domain"]))
    .filter((operation) => extensionMatches(operation, "network", filters["unisat-network"]))
    .filter((operation) => extensionMatches(operation, "status", filters["unisat-status"]))
    .filter((operation) => extensionMatches(operation, "readonly", filters["unisat-readonly"]))
    .filter((operation) => extensionMatches(operation, "requires-confirmation", filters["unisat-requires-confirmation"]));
}

function getOperationCommand(commandName) {
  if (commandName === creditsOperation.commandName) return creditsOperation;
  return listOperationCommands().find((operation) => operation.commandName === commandName) || null;
}

module.exports = {
  getOperationCommand,
  listOperationCommands,
};
