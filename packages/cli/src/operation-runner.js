const { callApi } = require("./api-call");
const { buildRequestPlan, exampleValue } = require("./openapi-request");
const { validateBody } = require("./operation-policy");
const { parseBooleanOption } = require("./arg-utils");

const GLOBAL_OPTION_NAMES = new Set([
  "api-key",
  "body",
  "confirm",
  "dry-run",
  "env",
  "format",
  "help",
  "plan",
]);

function optionProvided(options, name) {
  return options[name] !== undefined && options[name] !== null;
}

function getOperationParams(operation, location) {
  return operation.parameters.filter((parameter) => parameter.in === location);
}

function collectLocationParams(operation, options, location) {
  return getOperationParams(operation, location).reduce((result, parameter) => {
    if (optionProvided(options, parameter.name)) {
      result[parameter.name] = options[parameter.name];
    }
    return result;
  }, {});
}

function missingRequiredParams(operation, options) {
  return {
    pathParams: getOperationParams(operation, "path")
      .filter((parameter) => parameter.required)
      .filter((parameter) => !optionProvided(options, parameter.name))
      .map((parameter) => parameter.name),
    queryParams: getOperationParams(operation, "query")
      .filter((parameter) => parameter.required)
      .filter((parameter) => !optionProvided(options, parameter.name))
      .map((parameter) => parameter.name),
    body: requiresJsonBody(operation) && !optionProvided(options, "body"),
  };
}

function requiresJsonBody(operation) {
  return String(operation.method).toLowerCase() !== "get" && operation.requestBody?.required === true;
}

function hasMissing(missing) {
  return missing.pathParams.length > 0 || missing.queryParams.length > 0 || missing.body;
}

function buildNextAction(commandName, missing) {
  const flags = [...missing.pathParams, ...missing.queryParams].map((name) => `--${name}=<value>`);
  if (missing.body) {
    flags.push("--body='<json>'");
  }
  return flags.length > 0 ? `Re-run with ${flags.join(" ")}.` : undefined;
}

function buildExampleCommand(operation, providedOptions = {}) {
  const flags = [];
  operation.parameters
    .filter((parameter) => parameter.required)
    .forEach((parameter) => {
      const value = optionProvided(providedOptions, parameter.name) ? providedOptions[parameter.name] : exampleValue(parameter);
      flags.push(`--${parameter.name}=${value}`);
    });
  if (requiresJsonBody(operation)) {
    const body = optionProvided(providedOptions, "body") ? providedOptions.body : "<JSON matching the request body schema>";
    flags.push(`--body='${body}'`);
  }
  return `unisat-openapi-cli ${operation.commandName}${flags.length ? ` ${flags.join(" ")}` : ""} --format json`;
}

function buildPlanPayload(operation, options) {
  const environment = options.env || "bitcoin";
  const missing = missingRequiredParams(operation, options);
  const pathParams = collectLocationParams(operation, options, "path");
  const queryParams = collectLocationParams(operation, options, "query");

  if (hasMissing(missing)) {
    return {
      command: operation.commandName,
      mode: "missing_required_params",
      operation: summarizeOperation(operation),
      missing,
      recoverable: true,
      nextAction: buildNextAction(operation.commandName, missing),
      example: buildExampleCommand(operation, options),
    };
  }

  const bodyProblem = validateBody(options.body, operation);
  if (bodyProblem) return { command: operation.commandName, operation: summarizeOperation(operation), ...bodyProblem };
  const plan = buildRequestPlan(operation.path, {
    environment,
    pathParams,
    queryParams,
    includeOptionalQuery: false,
    requirePathParams: true,
  });

  if (!plan) {
    return {
      command: operation.commandName,
      mode: "not_found",
      operation: summarizeOperation(operation),
      path: operation.path,
      recoverable: false,
    };
  }

  if (plan.mode === "invalid_environment") {
    return {
      command: operation.commandName,
      mode: "invalid_environment",
      environment,
      message: "Unsupported environment. Use --env bitcoin or --env fractal.",
      recoverable: true,
    };
  }

  if (plan.mode === "invalid_parameters") return { command: operation.commandName, ...plan };

  return {
    command: operation.commandName,
    mode: "plan",
    operation: summarizeOperation(operation),
    missing,
    request: {
      environment: plan.environment.name,
      environmentLabel: plan.environment.label,
      baseUrl: plan.baseUrl,
      resolvedPath: plan.resolvedPath,
      queryString: plan.queryString,
      url: plan.url,
      pathParams: plan.pathParams.map((parameter) => ({
        name: parameter.name,
        value: parameter.value,
      })),
      queryParams: plan.queryEntries.map((parameter) => ({
        name: parameter.name,
        value: parameter.value,
      })),
      body: options.body,
    },
    safety: {
      readOnly: operation.readOnly,
      requiresConfirmation: operation.requiresConfirmation,
    },
    example: buildExampleCommand(operation, options),
  };
}

async function runOperationCommand(operation, options, apiKey, apiKeySource) {
  const wantsDryRun = parseBooleanOption(options["dry-run"]) || parseBooleanOption(options.plan);
  const planPayload = buildPlanPayload(operation, options);
  if (wantsDryRun || planPayload.mode !== "plan") {
    return planPayload;
  }

  const pathParams = collectLocationParams(operation, options, "path");
  const queryParams = collectLocationParams(operation, options, "query");
  const callPayload = await callApi({
    apiPath: operation.path,
    apiKey,
    apiKeySource,
    environment: options.env || "bitcoin",
    pathParamsList: pathParams,
    queryParamsList: queryParams,
    body: options.body,
    confirm: parseBooleanOption(options.confirm),
  });

  return {
    ...callPayload,
    command: operation.commandName,
    operation: summarizeOperation(operation),
  };
}

function summarizeOperation(operation) {
  return {
    operationId: operation.operationId,
    method: operation.method,
    path: operation.path,
    file: operation.file,
    tags: operation.tags,
    summary: operation.summary,
    description: operation.description,
    unisat: operation.unisat,
    parameters: operation.parameters,
    requestBody: operation.requestBody,
    readOnly: operation.readOnly,
    requiresConfirmation: operation.requiresConfirmation,
  };
}

function nonGlobalOptions(options) {
  return Object.fromEntries(Object.entries(options).filter(([name]) => !GLOBAL_OPTION_NAMES.has(name)));
}

module.exports = {
  buildExampleCommand,
  buildPlanPayload,
  nonGlobalOptions,
  runOperationCommand,
};
