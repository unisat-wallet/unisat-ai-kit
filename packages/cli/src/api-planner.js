const { buildRequestPlan } = require("./openapi-request");
const { DEFAULT_OPENAPI_ENVIRONMENT } = require("./openapi-environments");
const { getOpenApiCapability, listOpenApiCapabilities } = require("./openapi-capabilities");

const DEFAULT_PAGE_PARAM_VALUES = {
  cursor: 0,
  start: 0,
  limit: 20,
  size: 20,
};

function hasStructuredPlannerInput(input = {}) {
  return Boolean(input.intent || input.action || input.resource);
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function canonicalAction(value) {
  const text = normalizeText(value);
  if (["read", "get", "list", "query", "show"].includes(text)) return "read";
  if (["broadcast", "push"].includes(text)) return "broadcast";
  if (["swap"].includes(text)) return "swap";
  if (["write", "post", "create", "send", "add", "remove"].includes(text)) return "write";
  return text || "unknown";
}

function buildTaskFrame(input = {}) {
  const preferences = normalizeObject(input.preferences);
  const entities = normalizeObject(input.entities);
  const action = canonicalAction(input.action || (String(input.intent || "").startsWith("read.") ? "read" : ""));
  return {
      task: input.task || "",
    intent: input.intent || "",
    action,
    resource: input.resource || "",
    environment: input.environment || DEFAULT_OPENAPI_ENVIRONMENT,
    entities,
    preferences: {
      readOnlyOnly: preferences.readOnlyOnly === true,
      includeOptionalParams: preferences.includeOptionalParams === true,
      includeExecutableExample: preferences.includeExecutableExample !== false,
      maxAlternatives: Number.isInteger(preferences.maxAlternatives) ? preferences.maxAlternatives : input.top ?? 5,
    },
    shell: input.shell || "powershell",
  };
}

function getEntityValue(taskFrame, entityName) {
  const entities = taskFrame.entities || {};
  const aliases = {
    blockHash: ["blockHash", "blockid", "blockId"],
    inscriptionId: ["inscriptionId", "inscriptionid"],
    collectionId: ["collectionId", "collectionid"],
    orderId: ["orderId", "orderid"],
    txHex: ["txHex", "rawTx", "rawtx"],
    txsHex: ["txsHex", "rawTxs", "rawtxs"],
  };
  const keys = aliases[entityName] || [entityName];
  const key = keys.find((item) => Object.hasOwn(entities, item));
  return key ? entities[key] : undefined;
}

function entityProvided(taskFrame, entityName) {
  const value = getEntityValue(taskFrame, entityName);
  return value !== undefined && value !== null && value !== "";
}

function scoreCapability(capability, taskFrame) {
  const result = { score: 0, reasons: [] };
  const cap = capability.capability;

  function add(points, reason) {
    if (!points) return;
    result.score += points;
    result.reasons.push(reason);
  }

  if (taskFrame.intent && cap.intent === taskFrame.intent) {
    add(500, `matched explicit intent ${taskFrame.intent}`);
  } else if (taskFrame.intent && cap.intent.startsWith(taskFrame.intent)) {
    add(55, `matched intent prefix ${taskFrame.intent}`);
  }

  if (taskFrame.action !== "unknown" && cap.action === taskFrame.action) {
    add(28, `matched action ${taskFrame.action}`);
  }

  if (taskFrame.resource && cap.resource === taskFrame.resource) {
    add(35, `matched resource ${taskFrame.resource}`);
  }

  if (cap.environments.includes(taskFrame.environment)) {
    add(8, `supports environment ${taskFrame.environment}`);
  } else {
    add(-80, `does not support environment ${taskFrame.environment}`);
  }

  if (taskFrame.preferences.readOnlyOnly && capability.method !== "GET") {
    add(-200, "readOnlyOnly excludes non-GET operation");
  }

  if (taskFrame.action === "read" && cap.sideEffect !== "none") {
    add(-160, "read action excludes side-effect operation");
  }

  const requiredEntities = cap.requiredEntities || [];
  requiredEntities.forEach((entity) => {
    if (entityProvided(taskFrame, entity)) {
      add(22, `provided required entity ${entity}`);
    } else {
      add(-18, `missing required entity ${entity}`);
    }
  });

  const taskText = normalizeText(taskFrame.task);
  [cap.intent, cap.resource, cap.domain, capability.summary, capability.description].forEach((value) => {
    const text = normalizeText(value);
    if (text && taskText && taskText.includes(text)) {
      add(5, `task text includes ${text}`);
    }
  });

  return result;
}

function findCandidates(taskFrame, explicitPath) {
  const capabilities = explicitPath ? [getOpenApiCapability(explicitPath)].filter(Boolean) : listOpenApiCapabilities();
  return capabilities
    .map((capability) => {
      const scored = scoreCapability(capability, taskFrame);
      return {
        ...capability,
        score: scored.score,
        whyMatched: Array.from(new Set(scored.reasons)),
      };
    })
    .filter((candidate) => explicitPath || candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
}

function parameterEntityName(parameter, capability) {
  const mapped = capability.capability.parameterEntityMap?.[parameter.name];
  if (mapped) return mapped;
  const name = parameter.name.toLowerCase();
  if (name === "blockid") return "blockHash";
  if (name === "inscriptionid") return "inscriptionId";
  if (name === "collectionid") return "collectionId";
  if (name === "orderid") return "orderId";
  if (name === "txhex") return "txHex";
  if (name === "txshex") return "txsHex";
  if (name === "tick") return "ticker";
  return name;
}

function buildQueryParamOverrides(capability, taskFrame) {
  const overrides = { ...(capability.capability.defaultQueryParams || {}) };
  const queryParams = normalizeObject(taskFrame.entities.queryParams);
  Object.assign(overrides, queryParams);

  capability.parameters
    .filter((parameter) => parameter.in === "query")
    .forEach((parameter) => {
      const entityName = parameterEntityName(parameter, capability);
      const value = getEntityValue(taskFrame, entityName);
      if (value !== undefined) overrides[parameter.name] = value;
      if (parameter.required && overrides[parameter.name] === undefined && DEFAULT_PAGE_PARAM_VALUES[parameter.name] !== undefined) {
        overrides[parameter.name] = DEFAULT_PAGE_PARAM_VALUES[parameter.name];
      }
    });

  return overrides;
}

function buildBodyBinding(capability, taskFrame) {
  const template = capability.requestBodyTemplate;
  const bodyEntities = normalizeObject(taskFrame.entities.body);
  const shouldBuildImplicitBody = capability.method !== "GET" || capability.capability.sideEffect !== "none";
  const body = template ? (Array.isArray(template) ? [...template] : { ...template }) : {};

  Object.keys(body).forEach((key) => {
    const value = getEntityValue(taskFrame, key);
    if (value !== undefined) {
      body[key] = value;
    }
  });

  if (shouldBuildImplicitBody) {
    (capability.capability.requiredEntities || []).forEach((entity) => {
      const value = getEntityValue(taskFrame, entity);
      if (value !== undefined && !capability.parameters.some((parameter) => parameter.name === entity)) {
        body[entity] = value;
      }
    });
  }

  Object.assign(body, bodyEntities);
  return Object.keys(body).length > 0 ? body : null;
}

function bindParams(capability, taskFrame) {
  const missing = [];
  const pathParams = {};

  capability.parameters
    .filter((parameter) => parameter.in === "path")
    .forEach((parameter) => {
      const entityName = parameterEntityName(parameter, capability);
      const value = getEntityValue(taskFrame, entityName);
      if (value === undefined || value === null || value === "") {
        missing.push({ kind: entityName, requiredBy: `pathParams.${parameter.name}` });
        return;
      }
      pathParams[parameter.name] = value;
    });

  (capability.capability.requiredEntities || []).forEach((entity) => {
    if (!entityProvided(taskFrame, entity) && !missing.some((item) => item.kind === entity)) {
      missing.push({ kind: entity, requiredBy: "entities" });
    }
  });

  const queryParams = buildQueryParamOverrides(capability, taskFrame);
  const body = buildBodyBinding(capability, taskFrame);
  return { pathParams, queryParams, body, missing };
}

function planModeFor(capability, binding, taskFrame) {
  if (taskFrame.preferences.readOnlyOnly && capability.method !== "GET") return "unsafe_intent_mismatch";
  if (taskFrame.action === "read" && capability.capability.sideEffect !== "none") return "unsafe_intent_mismatch";
  if (binding.missing.length > 0) return "missing_required_entities";
  if (capability.capability.sideEffect !== "none" || capability.method !== "GET") return "confirmation_required";
  return "planned";
}

function nextActionFor(mode) {
  if (mode === "planned") return "call_api";
  if (mode === "missing_required_entities") return "ask_user";
  if (mode === "confirmation_required") return "ask_confirmation";
  if (mode === "unsafe_intent_mismatch") return "revise_task";
  if (mode === "ambiguous") return "ask_user";
  return "revise_task";
}

function buildAskUser(mode, binding, capability) {
  if (mode === "missing_required_entities") {
    return `Please provide ${binding.missing.map((item) => item.kind).join(", ")}.`;
  }
  if (mode === "confirmation_required") {
    return `Please confirm before executing ${capability.method} ${capability.path}.`;
  }
  if (mode === "unsafe_intent_mismatch") {
    return "The requested read-only task matches a state-changing operation. Provide a write/broadcast intent if this is intentional.";
  }
  return undefined;
}

function buildPlanResult(capability, binding, taskFrame, alternatives) {
  const mode = planModeFor(capability, binding, taskFrame);
  const requestPlan = buildRequestPlan(capability.path, {
    environment: taskFrame.environment,
    pathParams: binding.pathParams,
    queryParams: binding.queryParams,
    includeOptionalQuery: taskFrame.preferences.includeOptionalParams,
  });
  const executable = mode === "planned";

  return {
    command: "intro.resolve",
    mode,
    input: {
      task: taskFrame.task,
      intent: taskFrame.intent,
      action: taskFrame.action,
      resource: taskFrame.resource,
      environment: taskFrame.environment,
      entities: taskFrame.entities,
      inputQuality: taskFrame.intent || taskFrame.action || taskFrame.resource ? "structured" : "path_direct",
    },
    selected: {
      path: capability.path,
      method: capability.method,
      operationId: capability.operationId,
      file: capability.file,
      summary: capability.summary,
      description: capability.description,
      tags: capability.tags,
      domain: capability.capability.domain,
      capability: capability.capability,
      capabilitySource: capability.capabilitySource,
      capabilityConfidence: capability.capabilityConfidence,
    },
    bindings: {
      pathParams: binding.pathParams,
      queryParams: binding.queryParams,
      body: binding.body,
      missing: binding.missing,
    },
    safety: {
      action: capability.capability.action,
      sideEffect: capability.capability.sideEffect,
      requiresConfirmation: mode === "confirmation_required",
      executable,
    },
    match: {
      score: capability.score,
      confidence: capability.score >= 100 ? "high" : capability.score >= 40 ? "medium" : "low",
      whyMatched: capability.whyMatched,
    },
    parameters: {
      pathParams: capability.parameters.filter((item) => item.in === "path"),
      queryParams: capability.parameters.filter((item) => item.in === "query"),
      headerParams: capability.parameters.filter((item) => item.in === "header"),
      cookieParams: capability.parameters.filter((item) => item.in === "cookie"),
      requestBodyTemplate: capability.requestBodyTemplate,
    },
    example: {
      shell: taskFrame.shell,
      environment: taskFrame.environment,
      url: executable && taskFrame.preferences.includeExecutableExample && requestPlan?.url ? requestPlan.url : "",
      command: "",
    },
    alternatives,
    nextAction: nextActionFor(mode),
    askUser: buildAskUser(mode, binding, capability),
  };
}

function toAlternative(candidate) {
  return {
    path: candidate.path,
    method: candidate.method,
    operationId: candidate.operationId,
    summary: candidate.summary,
    capability: candidate.capability,
    capabilitySource: candidate.capabilitySource,
    capabilityConfidence: candidate.capabilityConfidence,
    score: candidate.score,
    whyMatched: candidate.whyMatched,
  };
}

function planApiCall(input = {}) {
  const taskFrame = buildTaskFrame(input);
  const candidates = findCandidates(taskFrame, input.apiPath || input.path);
  if (candidates.length === 0) {
    return {
      command: "intro.resolve",
      mode: "not_found",
      input: taskFrame,
      matches: [],
      nextAction: "revise_task",
      message: "No API capability matched the structured task.",
    };
  }

  const [selected] = candidates;
  const maxAlternatives = Math.max(0, Math.min(10, taskFrame.preferences.maxAlternatives));
  const alternatives = candidates.slice(1, maxAlternatives + 1).map(toAlternative);
  const binding = bindParams(selected, taskFrame);
  return buildPlanResult(selected, binding, taskFrame, alternatives);
}

module.exports = {
  hasStructuredPlannerInput,
  planApiCall,
};
