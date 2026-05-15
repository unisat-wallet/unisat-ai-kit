const { getOpenApiDetail } = require("./openapi-utils");

function exampleValue(parameter) {
  const normalizedName = parameter.name.toLowerCase();

  if (normalizedName === "start" || normalizedName === "cursor" || normalizedName.endsWith("offset")) {
    return "0";
  }
  if (normalizedName === "limit" || normalizedName === "size") {
    return "16";
  }
  if (parameter.type === "integer" || parameter.type === "number") {
    return "1";
  }
  if (parameter.type === "boolean") {
    return "true";
  }
  if (normalizedName.includes("address")) {
    return "YOUR_ADDRESS";
  }
  if (normalizedName.includes("ticker") || normalizedName.includes("tick")) {
    return "ordi";
  }
  if (normalizedName.includes("id")) {
    return "YOUR_ID";
  }
  return `YOUR_${parameter.name.toUpperCase()}`;
}

function buildResolvedPath(apiPath, pathParams) {
  let resolvedPath = apiPath;
  pathParams.forEach((parameter) => {
    resolvedPath = resolvedPath.replace(`{${parameter.name}}`, parameter.value);
  });
  return resolvedPath;
}

function buildQueryEntries(parameters, overrides = {}, includeOptional = true) {
  return parameters
    .filter((parameter) => parameter.in === "query")
    .filter((parameter) => includeOptional || parameter.required || Object.hasOwn(overrides, parameter.name))
    .map((parameter) => ({
      name: parameter.name,
      required: parameter.required,
      description: parameter.description,
      value: overrides[parameter.name] || exampleValue(parameter),
    }));
}

function buildQueryString(entries) {
  if (entries.length === 0) {
    return "";
  }

  return entries
    .map((entry) => `${encodeURIComponent(entry.name)}=${encodeURIComponent(entry.value)}`)
    .join("&");
}

function parseKeyValueString(input) {
  if (!input) {
    return {};
  }

  const params = new URLSearchParams(input);
  const result = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

function buildRequestPlan(apiPath, overrides = {}) {
  const detail = getOpenApiDetail(apiPath);
  if (!detail) {
    return null;
  }

  const baseUrl = overrides.baseUrl || detail.servers[0] || "https://open-api.unisat.io";
  const pathParams = detail.parameters
    .filter((parameter) => parameter.in === "path")
    .map((parameter) => ({
      ...parameter,
      value: overrides.pathParams?.[parameter.name] || exampleValue(parameter),
    }));
  const queryEntries = buildQueryEntries(
    detail.parameters,
    overrides.queryParams,
    overrides.includeOptionalQuery !== false
  );
  const resolvedPath = buildResolvedPath(detail.path, pathParams);
  const queryString = buildQueryString(queryEntries);
  const url = queryString ? `${baseUrl}${resolvedPath}?${queryString}` : `${baseUrl}${resolvedPath}`;

  return {
    detail,
    baseUrl,
    pathParams,
    queryEntries,
    resolvedPath,
    queryString,
    url,
  };
}

module.exports = {
  buildQueryString,
  buildRequestPlan,
  exampleValue,
  parseKeyValueString,
};
