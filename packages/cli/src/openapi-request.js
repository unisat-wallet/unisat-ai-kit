const { getOpenApiDetail } = require("./openapi-utils");
const { DEFAULT_OPENAPI_ENVIRONMENT, getOpenApiEnvironment } = require("./openapi-environments");

function exampleValue(parameter) {
  const normalizedName = parameter.name.toLowerCase();

  if (parameter.example !== undefined) {
    return parameter.example;
  }

  if (parameter.default !== undefined) {
    return parameter.default;
  }

  if (Array.isArray(parameter.enum) && parameter.enum.length > 0) {
    return parameter.enum[0];
  }

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

function valueProvided(value) {
  return value !== undefined && value !== null;
}

function stringValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(",");
  }
  return String(value);
}

function objectHasCaseInsensitive(object, key) {
  return Object.keys(object || {}).some((item) => item.toLowerCase() === key.toLowerCase());
}

function getCaseInsensitiveValue(object, key) {
  const actualKey = Object.keys(object || {}).find((item) => item.toLowerCase() === key.toLowerCase());
  return actualKey ? object[actualKey] : undefined;
}

function extractPathParameterNames(apiPath) {
  const names = [];
  const matcher = /\{([^}]+)\}/g;
  let match = matcher.exec(apiPath);
  while (match) {
    names.push(match[1]);
    match = matcher.exec(apiPath);
  }
  return names;
}

function ensurePathParameters(detail) {
  const existingNames = new Set(detail.parameters.filter((parameter) => parameter.in === "path").map((parameter) => parameter.name));
  const inferredParameters = extractPathParameterNames(detail.path)
    .filter((name) => !existingNames.has(name))
    .map((name) => ({
      name,
      in: "path",
      required: true,
      description: "",
      type: "string",
    }));
  return [...detail.parameters, ...inferredParameters];
}

function encodePathValue(value) {
  return encodeURIComponent(stringValue(value));
}

function buildResolvedPath(apiPath, pathParams) {
  let resolvedPath = apiPath;
  pathParams.forEach((parameter) => {
    const escapedName = parameter.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    resolvedPath = resolvedPath.replace(new RegExp(`\\{${escapedName}\\}`, "g"), encodePathValue(parameter.value));
  });
  return resolvedPath;
}

function buildQueryEntries(parameters, overrides = {}, includeOptional = true) {
  const parameterNames = new Set(parameters.filter((parameter) => parameter.in === "query").map((parameter) => parameter.name.toLowerCase()));
  const documentedEntries = parameters
    .filter((parameter) => parameter.in === "query")
    .filter((parameter) => includeOptional || parameter.required || objectHasCaseInsensitive(overrides, parameter.name))
    .map((parameter) => ({
      name: parameter.name,
      required: parameter.required,
      description: parameter.description,
      value: valueProvided(getCaseInsensitiveValue(overrides, parameter.name))
        ? getCaseInsensitiveValue(overrides, parameter.name)
        : exampleValue(parameter),
    }));
  const extraEntries = Object.entries(overrides || {})
    .filter(([name]) => !parameterNames.has(name.toLowerCase()))
    .map(([name, value]) => ({
      name,
      required: false,
      description: "",
      value,
      undocumented: true,
    }));
  return [...documentedEntries, ...extraEntries];
}

function buildQueryString(entries) {
  if (entries.length === 0) {
    return "";
  }

  const params = new URLSearchParams();
  entries.forEach((entry) => {
    if (!valueProvided(entry.value)) {
      return;
    }
    if (Array.isArray(entry.value)) {
      entry.value.forEach((value) => params.append(entry.name, String(value)));
      return;
    }
    params.append(entry.name, String(entry.value));
  });
  return params.toString();
}

function parseKeyValueString(input) {
  if (!input) {
    return {};
  }
  if (typeof input === "object" && !Array.isArray(input)) {
    return input;
  }

  const entries = Array.isArray(input) ? input : String(input).split(String(input).includes("&") ? "&" : ",");
  const result = {};
  entries.forEach((entry) => {
    const text = String(entry).trim();
    if (!text) {
      return;
    }
    const separatorIndex = text.indexOf("=");
    if (separatorIndex === -1) {
      return;
    }
    const key = decodeURIComponent(text.slice(0, separatorIndex).trim());
    const value = decodeURIComponent(text.slice(separatorIndex + 1).trim());
    if (!key) {
      return;
    }
    if (Object.hasOwn(result, key)) {
      result[key] = Array.isArray(result[key]) ? [...result[key], value] : [result[key], value];
      return;
    }
    result[key] = value;
  });
  return result;
}

function buildRequestPlan(apiPath, overrides = {}) {
  const detail = getOpenApiDetail(apiPath);
  if (!detail) {
    return null;
  }

  const parameters = ensurePathParameters(detail);
  const pathParamOverrides = overrides.pathParams || {};
  const requirePathParams = overrides.requirePathParams === true;
  const missingPathParams = parameters
    .filter((parameter) => parameter.in === "path")
    .filter((parameter) => !valueProvided(getCaseInsensitiveValue(pathParamOverrides, parameter.name)))
    .map((parameter) => parameter.name);

  if (requirePathParams && missingPathParams.length > 0) {
    return {
      mode: "missing_path_params",
      path: apiPath,
      missingPathParams,
    };
  }

  const missingQueryParams = parameters
    .filter((parameter) => parameter.in === "query" && parameter.required)
    .filter((parameter) => !valueProvided(getCaseInsensitiveValue(overrides.queryParams || {}, parameter.name)))
    .map((parameter) => parameter.name);
  if (overrides.requireQueryParams === true && missingQueryParams.length > 0) {
    return { mode: "missing_query_params", path: apiPath, missingQueryParams };
  }

  const environment = getOpenApiEnvironment(overrides.environment || DEFAULT_OPENAPI_ENVIRONMENT);
  if (!environment) {
    return {
      mode: "invalid_environment",
      environment: overrides.environment,
    };
  }

  const baseUrl = detail.baseUrl || environment.baseUrl;
  const pathParams = parameters
    .filter((parameter) => parameter.in === "path")
    .map((parameter) => ({
      ...parameter,
      value: valueProvided(getCaseInsensitiveValue(pathParamOverrides, parameter.name))
        ? getCaseInsensitiveValue(pathParamOverrides, parameter.name)
        : exampleValue(parameter),
    }));
  const queryEntries = buildQueryEntries(
    parameters,
    overrides.queryParams,
    overrides.includeOptionalQuery !== false
  );
  const resolvedPath = buildResolvedPath(detail.path, pathParams);
  const tickFilter = queryEntries.find((entry) => entry.name === "tick_filter");
  const filterValues = tickFilter ? [].concat(tickFilter.value) : [];
  if (environment.name === "fractal" && filterValues.some((value) => /^\d+$/.test(String(value)) && (BigInt(value) & 32n) !== 0n)) {
    return {
      mode: "invalid_parameters", path: apiPath, environment: environment.name,
      parameter: "tick_filter",
      message: "Fractal does not support tick_filter bit 32, including the combined value 56.",
      nextAction: "Choose the intended supported Fractal filter (8, 16, or 24), or omit tick_filter for the server default. No filter has been substituted; Bitcoin character-length meanings do not apply to Fractal.",
    };
  }
  const queryString = buildQueryString(queryEntries);
  const url = queryString ? `${baseUrl}${resolvedPath}?${queryString}` : `${baseUrl}${resolvedPath}`;

  return {
    detail: {
      ...detail,
      parameters,
    },
    environment,
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
