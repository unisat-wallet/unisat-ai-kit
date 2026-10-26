const { buildRequestPlan, parseKeyValueString } = require("./openapi-request");
const { isReadOnly, requiresConfirmation, validateBody } = require("./operation-policy");
const { withRecovery } = require("./result-utils");
const { parseLosslessJson } = require("./lossless-json");
const { fetchWithProxy, networkDiagnostic } = require("./http-transport");
const { creditsOperation, normalizeCreditsResponse } = require("./credits");

const DEVELOPER_PORTAL_URL = "https://developer.unisat.io/";

function buildHeaders(apiKey, hasJsonBody, clientSource) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "X-Unisat-AI-Client": clientSource,
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

  return parseLosslessJson(body);
}

function selectParsedParams(primary, fallback) {
  const primaryParams = parseKeyValueString(primary);
  if (Object.keys(primaryParams).length > 0) {
    return primaryParams;
  }
  return parseKeyValueString(fallback);
}

async function executeApi({ apiPath, apiKey, apiKeySource, environment, query, queryParamsList, pathParams, pathParamsList, body, dryRun = false, confirm = false, clientSource = "cli" }) {
  let plan;
  try {
    plan = buildRequestPlan(apiPath, {
    environment,
    queryParams: selectParsedParams(queryParamsList, query),
    pathParams: selectParsedParams(pathParamsList, pathParams),
    includeOptionalQuery: false,
    requirePathParams: true,
    requireQueryParams: true,
    });
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
    return { command: "api.call", mode: "invalid_parameters", message: "Invalid percent encoding in path or query parameters." };
  }

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

  if (plan.mode === "invalid_parameters") return { command: "api.call", ...plan };

  if (plan.mode === "missing_path_params") {
    return {
      command: "api.call",
      mode: "missing_path_params",
      path: plan.path,
      missingPathParams: plan.missingPathParams,
      message: `Missing required path parameter(s): ${plan.missingPathParams.join(", ")}.`,
    };
  }

  if (plan.mode === "missing_query_params") {
    return {
      command: "api.call",
      ...plan,
      message: `Missing required query parameter(s): ${plan.missingQueryParams.join(", ")}.`,
    };
  }

  const bodyProblem = validateBody(body, plan.detail);
  if (bodyProblem) return { command: "api.call", path: apiPath, ...bodyProblem };
  const safety = {
    readOnly: isReadOnly(plan.detail.method, plan.detail.unisat),
    requiresConfirmation: requiresConfirmation(plan.detail.method, plan.detail.unisat),
  };
  const requestBody = parseJsonBody(body);
  const method = plan.detail.method.toUpperCase();

  if (dryRun) {
    return {
      command: "api.call",
      mode: "plan",
      safety,
      path: plan.detail.path,
      method: plan.detail.method,
      file: plan.detail.file,
      environment: plan.environment.name,
      environmentLabel: plan.environment.label,
      baseUrl: plan.baseUrl,
      url: plan.url,
      request: {
        headers: {
          Authorization: apiKey ? "Bearer ***" : "Bearer <api-key>",
          "X-Unisat-AI-Client": clientSource,
          ...(requestBody !== null ? { "Content-Type": "application/json" } : {}),
        },
        queryParams: plan.queryEntries,
        pathParams: plan.pathParams.map((parameter) => ({
          name: parameter.name,
          value: parameter.value,
        })),
        body: requestBody,
      },
    };
  }

  if (safety.requiresConfirmation && confirm !== true) {
    return { command: "api.call", mode: "confirmation_required", path: apiPath,
      method: plan.detail.method, safety,
      message: "This operation requires user authorization. Supply --confirm only after approval." };
  }

  if (!apiKey) {
    return {
      command: "api.call",
      mode: "missing_api_key",
      environment,
      message: `API key is not configured. Provide --api-key <key> or set the environment-specific key before running api call. If you have not registered an API key yet, register at ${DEVELOPER_PORTAL_URL}`,
      developerPortalUrl: DEVELOPER_PORTAL_URL,
    };
  }

  const headers = buildHeaders(apiKey, requestBody !== null, clientSource);
  let response, responseBody, contentType;
  try {
    response = await fetchWithProxy(plan.url, {
      method, headers, signal: AbortSignal.timeout(30000),
      // Send the validated original JSON; parsing and reserializing can round
      // numbers or change a preserved numeric token into a JSON string.
      body: requestBody === null ? undefined : body,
    });
    contentType = response.headers.get("content-type") || "";
    const responseText = await response.text();
    responseBody = contentType.includes("application/json") ? parseLosslessJson(responseText) : responseText;
    if (plan.detail.path === creditsOperation.path) responseBody = normalizeCreditsResponse(responseBody);
  } catch (error) {
    const mode = error.name === "TimeoutError" || error.name === "AbortError" ? "timeout"
      : error instanceof SyntaxError ? "invalid_response" : "network_error";
    return { command: "api.call", mode, path: apiPath, method: plan.detail.method, safety,
      network: mode === "network_error" ? networkDiagnostic(error, plan.url) : undefined,
      message: mode === "timeout" ? "OpenAPI request timed out after 30 seconds."
        : mode === "invalid_response" ? "Server returned malformed JSON." : "OpenAPI network request failed." };
  }
  const apiKeyProblem = getApiKeyProblem(response, responseBody);
  const quotaUnavailable = String(responseBody?.code) === "-2003"
    && /quota unavailable/i.test(responseBody?.msg || responseBody?.message || "");
  const httpError = !response.ok && !apiKeyProblem;
  const apiError = responseBody && typeof responseBody === "object"
    && ["number", "string"].includes(typeof responseBody.code)
    && responseBody.code !== 0 && responseBody.code !== "0";

  return {
    command: "api.call",
    mode: response.status === 403 ? "forbidden" : response.status === 429 ? "rate_limited"
      : apiKeyProblem ? "api_key_error" : httpError ? "http_error" : apiError ? "api_error" : "detail",
    safety,
    ...(quotaUnavailable ? {
      reason: "quota_unavailable",
      retryable: false,
      nextAction: "Check getCredits for the selected network and ask the account owner to verify quota and endpoint entitlement. A successful credits query does not prove endpoint access. Do not retry unchanged or switch networks to bypass this failure.",
    } : {}),
    message: quotaUnavailable ? "The server reports quota unavailable for this key and selected network. This does not establish that the key is invalid."
      : apiKeyProblem
      ? "API key is missing, invalid, or not authorized. Check --api-key or the selected environment key and try again."
      : httpError
        ? `UniSat OpenAPI returned HTTP ${response.status}.`
        : apiError
          ? `UniSat OpenAPI returned code ${responseBody.code}: ${responseBody.msg || responseBody.message || "Unknown API error"}`
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
        "X-Unisat-AI-Client": clientSource,
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
      ok: response.ok && !apiError && !apiKeyProblem,
      httpOk: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType,
      retryAfter: response.headers.get("retry-after") || undefined,
      body: responseBody,
    },
  };
}

async function callApi(options) {
  return withRecovery(await executeApi(options));
}

module.exports = {
  callApi,
};
