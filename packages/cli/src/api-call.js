const { buildRequestPlan, parseKeyValueString } = require("./openapi-request");

const DEVELOPER_PORTAL_URL = "https://developer.unisat.io/";

function buildHeaders(apiKey, hasJsonBody) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
  };

  if (hasJsonBody) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

function getApiKeyProblem(response, responseBody) {
  if (response.status === 401) {
    return "invalid_or_missing";
  }
  if (response.status === 403) {
    return "forbidden_or_invalid";
  }
  if (responseBody && typeof responseBody === "object") {
    const message = String(responseBody.message || responseBody.msg || responseBody.error || "").toLowerCase();
    if (message.includes("api key") || message.includes("apikey") || message.includes("unauthorized")) {
      return "invalid_or_missing";
    }
  }
  if (typeof responseBody === "string") {
    const message = responseBody.toLowerCase();
    if (message.includes("api key") || message.includes("apikey") || message.includes("unauthorized")) {
      return "invalid_or_missing";
    }
  }
  return null;
}

function parseJsonBody(body) {
  if (!body) {
    return null;
  }

  return JSON.parse(body);
}

function selectParsedParams(primary, fallback) {
  const primaryParams = parseKeyValueString(primary);
  if (Object.keys(primaryParams).length > 0) {
    return primaryParams;
  }
  return parseKeyValueString(fallback);
}

async function callApi({ apiPath, apiKey, apiKeySource, environment, query, queryParamsList, pathParams, pathParamsList, body }) {
  if (!apiKey) {
    return {
      command: "api.call",
      mode: "missing_api_key",
      environment,
      message: `API key is not configured. Provide --api-key <key> or set the environment-specific key before running api call. If you have not registered an API key yet, register at ${DEVELOPER_PORTAL_URL}`,
      developerPortalUrl: DEVELOPER_PORTAL_URL,
    };
  }

  const plan = buildRequestPlan(apiPath, {
    environment,
    queryParams: selectParsedParams(queryParamsList, query),
    pathParams: selectParsedParams(pathParamsList, pathParams),
    includeOptionalQuery: false,
    requirePathParams: true,
  });

  if (!plan) {
    return {
      command: "api.call",
      mode: "not_found",
      path: apiPath,
    };
  }

  if (plan.mode === "invalid_environment") {
    return {
      command: "api.call",
      mode: "invalid_environment",
      environment: plan.environment,
      message: "Unsupported environment. Use --env bitcoin or --env fractal.",
    };
  }

  if (plan.mode === "missing_path_params") {
    return {
      command: "api.call",
      mode: "missing_path_params",
      path: plan.path,
      missingPathParams: plan.missingPathParams,
      message: `Missing required path parameter(s): ${plan.missingPathParams.join(", ")}.`,
    };
  }

  const requestBody = parseJsonBody(body);
  const method = plan.detail.method.toUpperCase();
  const headers = buildHeaders(apiKey, requestBody !== null);
  const response = await fetch(plan.url, {
    method,
    headers,
    body: requestBody === null ? undefined : JSON.stringify(requestBody),
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const responseBody = isJson ? await response.json() : await response.text();
  const apiKeyProblem = getApiKeyProblem(response, responseBody);
  const httpError = !response.ok && !apiKeyProblem;

  return {
    command: "api.call",
    mode: apiKeyProblem ? "api_key_error" : httpError ? "http_error" : "detail",
    message: apiKeyProblem
      ? "API key is missing, invalid, or not authorized. Check --api-key or the selected environment key and try again."
      : httpError
        ? `UniSat OpenAPI returned HTTP ${response.status}.`
        : undefined,
    path: plan.detail.path,
    method: plan.detail.method,
    file: plan.detail.file,
    environment: plan.environment.name,
    environmentLabel: plan.environment.label,
    baseUrl: plan.baseUrl,
    url: plan.url,
    usedApiKeyFrom: apiKeySource || "provided",
    request: {
      headers: {
        Authorization: "Bearer ***",
        ...(requestBody !== null ? { "Content-Type": "application/json" } : {}),
      },
      queryParams: plan.queryEntries,
      pathParams: plan.pathParams.map((parameter) => ({
        name: parameter.name,
        value: parameter.value,
      })),
      body: requestBody,
    },
    response: {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType,
      body: responseBody,
    },
  };
}

module.exports = {
  callApi,
};
