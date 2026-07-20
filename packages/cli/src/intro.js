const path = require("path");
const { DEFAULT_OPENAPI_ENVIRONMENT } = require("./openapi-environments");
const { hasStructuredPlannerInput, planApiCall } = require("./api-planner");
const { getOpenApiDetail } = require("./openapi-utils");

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

function introResolve(input = {}) {
  const { apiPath, path: directPath, shell = "powershell", environment = DEFAULT_OPENAPI_ENVIRONMENT, top = 5 } = input;
  const selectedPath = apiPath || directPath;

  if (!hasStructuredPlannerInput(input) && !selectedPath) {
    return {
      command: "intro.resolve",
      mode: "structured_input_required",
      message: "Provide explicit structured planner fields such as intent/action/resource/entities, or provide an exact path.",
      example: {
        intent: "read.chain.recommendedFees",
        action: "read",
        resource: "chainFees",
        environment: DEFAULT_OPENAPI_ENVIRONMENT,
        preferences: { readOnlyOnly: true },
      },
    };
  }

  return planApiCall({
    ...input,
    apiPath: selectedPath,
    shell,
    environment,
    top,
  });
}

module.exports = {
  introResolve,
  introShow,
};
