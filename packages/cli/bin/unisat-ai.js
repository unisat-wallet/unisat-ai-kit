#!/usr/bin/env node

const { parseArgs, parseBooleanOption, toInt } = require("../src/arg-utils");
const { version } = require("../package.json");
const { callApi } = require("../src/api-call");
const { getConfiguredValue, upsertDotEnvValue } = require("../src/env-file");
const { DEFAULT_OPENAPI_ENVIRONMENT, getOpenApiEnvironment } = require("../src/openapi-environments");
const { listOperationCommands, getOperationCommand } = require("../src/operation-commands");
const { buildExampleCommand, runOperationCommand } = require("../src/operation-runner");
const { printOutput } = require("../src/format-utils");
const {
  ensureSwaggerCache,
  getSwaggerCacheStatus,
  refreshSwaggerCache,
} = require("../src/swagger-cache");

const GUIDE_NOTES = [
  "Use --format json for agent-friendly output.",
  "Use commands --format json or cached Swagger YAML to discover API commands.",
  "Use <api-command> --help, then --dry-run before real API calls.",
  "API keys are read from --api-key, process env, then user config .env.",
];

function getSwaggerPathHint() {
  const status = getSwaggerCacheStatus();
  return status.swaggerDir ? `${status.swaggerDir}/*.yaml` : "the local Swagger cache";
}

function printHelp() {
  const swaggerPathHint = getSwaggerPathHint();
  console.log("UniSat OpenAPI CLI");
  console.log("");
  console.log("Usage:");
  console.log("  unisat-openapi-cli <command> [options]");
  console.log("  unisat-openapi-cli --help");
  console.log("  unisat-openapi-cli -h");
  console.log("  unisat-openapi-cli help");
  console.log("");
  console.log("Fixed CLI commands:");
  console.log("  commands");
  console.log("      List generated OpenAPI operation commands from cached Swagger YAML.");
  console.log("  swagger status");
  console.log("      Show the local Swagger cache status.");
  console.log("  swagger refresh");
  console.log("      Download and validate the latest Swagger snapshot.");
  console.log("  config bitcoin-key");
  console.log("      Save the Bitcoin OpenAPI API key.");
  console.log("  config fractal-key");
  console.log("      Save the Fractal OpenAPI API key.");
  console.log("  api call");
  console.log("      Call an exact UniSat OpenAPI path directly.");
  console.log("  <api-command>");
  console.log(`      Call an API command generated from an OpenAPI operationId. Discover API commands by reading ${swaggerPathHint} or running commands --format json.`);
  console.log("");
  console.log("Global options:");
  console.log("  --format text|json");
  console.log("      Output format. Use json for agents and scripts.");
  console.log("  --help, -h");
  console.log("      Show help for the CLI, a fixed command, or an API command.");
  console.log("  --version, -v");
  console.log("      Show CLI package version.");
  console.log("");
  console.log("Environments:");
  console.log("  bitcoin -> https://open-api.unisat.io -> UNISAT_BITCOIN_API_KEY");
  console.log("  fractal -> https://open-api-fractal.unisat.io -> UNISAT_FRACTAL_API_KEY");
  console.log("");
  console.log("Notes:");
  GUIDE_NOTES.forEach((note) => console.log(`  - ${note}`));
}

function printCommandHelp(lines) {
  lines.forEach((line) => console.log(line));
}

function printConfigHelp() {
  printCommandHelp([
    "Usage:",
    "  unisat-openapi-cli config bitcoin-key --api-key <key> [options]",
    "  unisat-openapi-cli config fractal-key --api-key <key> [options]",
    "",
    "Description:",
    "  Save API keys into a user config .env file so they work on Windows, Linux, and macOS shells.",
    "",
    "Options:",
    "  --api-key <key>",
    "      API key to save. Required.",
    "  --format text|json",
    "      Output format. Use json for agents and scripts.",
    "  --help",
    "      Show this help message.",
    "",
    "Stored variables:",
    "  bitcoin -> UNISAT_BITCOIN_API_KEY",
    "  fractal -> UNISAT_FRACTAL_API_KEY",
    "",
    "Examples:",
    "  unisat-openapi-cli config bitcoin-key --api-key YOUR_BITCOIN_KEY",
    "  unisat-openapi-cli config fractal-key --api-key YOUR_FRACTAL_KEY --format json",
  ]);
}

function printCommandsHelp() {
  printCommandHelp([
    "Usage:",
    "  unisat-openapi-cli commands [options]",
    "",
    "Description:",
    "  List generated OpenAPI operation commands from cached Swagger YAML files.",
    "",
    "Options:",
    "  --domain <domain>",
    "      Filter by inferred API domain, for example brc20, alkanes, or runes.",
    "  --file <swagger-file>",
    "      Filter by swagger file name, for example brc20-indexer.yaml or alkanes-indexer.yaml.",
    "  --method <method>",
    "      Filter by HTTP method, for example get or post.",
    "  --tag <tag>",
    "      Filter by OpenAPI tag.",
    "  --unisat-domain <domain>",
    "      Filter by x-unisat-domain, for example brc20, runes, alkanes, or marketplace.",
    "  --unisat-network <network>",
    "      Filter by x-unisat-network, for example bitcoin, fractal, or multi.",
    "  --unisat-status <status>",
    "      Filter by x-unisat-status, for example recommended, not-recommended, deprecated, or experimental.",
    "  --unisat-readonly <true|false>",
    "      Filter by x-unisat-readonly.",
    "  --unisat-requires-confirmation <true|false>",
    "      Filter by x-unisat-requires-confirmation.",
    "  --limit <number>",
    "      Page size. Defaults to 50.",
    "  --start <number>",
    "      Start offset. Defaults to 0.",
    "  --page <number>",
    "      1-based page number. Ignored when --start is provided.",
    "  --all",
    "      Return all matched commands without pagination.",
    "  --format text|json",
    "      Output format. Use json for agents and scripts.",
    "  --help",
    "      Show this help message.",
    "",
    "Examples:",
    "  unisat-openapi-cli commands --format json",
    "  unisat-openapi-cli commands --page 2 --limit 50 --format json",
    "  unisat-openapi-cli commands --domain brc20 --all --format json",
  ]);
}

function printApiCallHelp() {
  printCommandHelp([
    "Usage:",
    "  unisat-openapi-cli api call --path <api-path> [options]",
    "",
    "Description:",
    "  Call an exact UniSat OpenAPI path directly. Prefer generated operation commands when available.",
    "  Reads API key from --api-key first, then process env, then user config .env.",
    "",
    "Options:",
    "  --path <api-path>",
    "      Exact OpenAPI path, for example /v1/indexer/address/{address}/balance. Required.",
    "  --env bitcoin|fractal",
    "      Target environment. Defaults to bitcoin.",
    "  --path-param k=v",
    "      Provide one path parameter. Can be repeated.",
    "  --query-param k=v",
    "      Provide one query parameter. Can be repeated.",
    "  --path-params \"a=1&b=2\"",
    "      Provide multiple path parameters as a string.",
    "  --query \"a=1&b=2\"",
    "      Provide query string parameters.",
    "  --body '<json>'",
    "      JSON request body for non-GET calls.",
    "  --dry-run",
    "      Preview the request without an API key or network call.",
    "  --api-key <key>",
    "      API key. Overrides process env and user config .env.",
    "  --format text|json",
    "      Output format. Use json for agents and scripts.",
    "  --help",
    "      Show this help message.",
    "",
    "Examples:",
    "  unisat-openapi-cli api call --env bitcoin --path \"/v1/price/btc\" --dry-run --format json",
    "  unisat-openapi-cli api call --env bitcoin --path \"/v1/indexer/address/{address}/balance\" --path-param address=YOUR_ADDRESS --format json",
    "  unisat-openapi-cli api call --env fractal --path \"/v1/public/fractal/supply\" --format json",
  ]);
}

function formatParameterHelp(parameter) {
  const details = [];
  if (parameter.format) details.push(`format: ${parameter.format}`);
  if (Array.isArray(parameter.enum) && parameter.enum.length > 0) details.push(`enum: ${parameter.enum.join("|")}`);
  if (parameter.default !== undefined) details.push(`default: ${parameter.default}`);
  if (parameter.example !== undefined) details.push(`example: ${parameter.example}`);
  if (parameter.minimum !== undefined) details.push(`min: ${parameter.minimum}`);
  if (parameter.maximum !== undefined) details.push(`max: ${parameter.maximum}`);
  const detailText = details.length > 0 ? ` ${details.join("; ")}` : "";
  return `  --${parameter.name} (${parameter.in}, ${parameter.required ? "required" : "optional"}, ${parameter.type || "unknown"})${detailText}${parameter.description ? ` - ${parameter.description}` : ""}`;
}

function hasRequestBody(operation) {
  return String(operation.method).toLowerCase() !== "get" && operation.requestBody?.required;
}

function requiredUsageFlags(operation) {
  const flags = operation.parameters
    .filter((parameter) => parameter.required)
    .map((parameter) => ` --${parameter.name}=<${parameter.type || "value"}>`);
  if (hasRequestBody(operation)) {
    flags.push(" --body='<json>'");
  }
  return flags.join("");
}

function printOperationHelp(operation) {
  console.log(`${operation.commandName}`);
  console.log("");
  console.log(operation.summary || operation.description || `${operation.method.toUpperCase()} ${operation.path}`);
  if (operation.description && operation.description !== operation.summary) {
    console.log(operation.description);
  }
  console.log("");
  console.log(`HTTP: ${operation.method.toUpperCase()} ${operation.path}`);
  console.log(`File: ${operation.file}`);
  if (operation.tags.length > 0) {
    console.log(`Tags: ${operation.tags.join(", ")}`);
  }
  if (operation.unisat && Object.keys(operation.unisat).length > 0) {
    console.log("UniSat metadata:");
    Object.entries(operation.unisat).forEach(([key, value]) => {
      console.log(`  ${key}: ${Array.isArray(value) ? value.join(", ") : value}`);
    });
  }
  console.log("");
  console.log("Usage:");
  const confirmFlag = operation.requiresConfirmation ? " [--confirm]" : "";
  console.log(`  ${operation.commandName}${requiredUsageFlags(operation)} [--env bitcoin|fractal] [--api-key <key>]${confirmFlag} [--dry-run] [--format text|json]`);
  console.log("");
  if (operation.parameters.length > 0) {
    console.log("Parameters:");
    operation.parameters.forEach((parameter) => {
      console.log(formatParameterHelp(parameter));
    });
    console.log("");
  }
  if (String(operation.method).toLowerCase() !== "get" && (operation.requestBody?.required || operation.requestBody?.contentTypes?.length > 0)) {
    console.log("Body:");
    console.log(`  --body '<json>' (${operation.requestBody?.required ? "required" : "optional"}) - JSON request body for this ${operation.method.toUpperCase()} operation. Request bodies are not expanded into individual CLI flags.`);
    if (Array.isArray(operation.requestBody?.contentTypes) && operation.requestBody.contentTypes.length > 0) {
      console.log(`  content-types: ${operation.requestBody.contentTypes.join(", ")}`);
    }
    console.log("");
  }
  console.log("Options:");
  console.log("  --env bitcoin|fractal");
  console.log("      Target environment. Defaults to bitcoin.");
  console.log("  --api-key <key>");
  console.log("      API key. Overrides process env and user config .env.");
  if (operation.requiresConfirmation) {
    console.log("  --confirm");
    console.log("      Required to execute operations marked as requiring confirmation by OpenAPI metadata.");
  }
  console.log("  --dry-run");
  console.log("      Preview the request without an API key or network call.");
  console.log("  --format text|json");
  console.log("      Output format. Use json for agents and scripts.");
  console.log("  --help");
  console.log("      Show this help message.");
  console.log("");
  console.log("Examples:");
  console.log(`  ${buildExampleCommand(operation)}`);
  console.log(`  ${buildExampleCommand(operation).replace(" --format json", " --dry-run --format json")}`);
}

function printSwaggerHelp() {
  printCommandHelp([
    "swagger commands:",
    "  swagger status [--format text|json]",
    "  swagger refresh [--force] [--format text|json]",
    "",
    "The cache refreshes automatically when API commands run and the cache TTL has expired.",
  ]);
}

async function initializeSwaggerCache() {
  const status = await ensureSwaggerCache();
  if (status.warning) {
    console.error(`warning: using cached Swagger: ${status.warning}`);
  }
  return status;
}

function resolveApiKey(options, environment) {
  if (options["api-key"]) {
    return {
      apiKey: options["api-key"],
      apiKeySource: "--api-key",
    };
  }

  return {
    apiKey: getConfiguredValue(environment.apiKeyEnv),
    apiKeySource: environment.apiKeyEnv,
  };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function failPayload(payload, format, textFallback) {
  if (format === "json") {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error(textFallback || payload.message || payload.mode || "command failed");
  }
  process.exit(1);
}

function buildCommandsPageCommand(options, nextStart, limit) {
  if (nextStart === null) {
    return null;
  }

  const flags = [];
  ["domain", "file", "method", "tag", "unisat-domain", "unisat-network", "unisat-status", "unisat-readonly", "unisat-requires-confirmation"].forEach((name) => {
    if (options[name]) {
      flags.push(`--${name} ${options[name]}`);
    }
  });
  flags.push(`--start ${nextStart}`);
  flags.push(`--limit ${limit}`);
  flags.push("--format json");
  return `unisat-openapi-cli commands ${flags.join(" ")}`;
}

function commandsPayload(options) {
  const items = listOperationCommands({
    domain: options.domain,
    file: options.file,
    method: options.method,
    tag: options.tag,
    "unisat-domain": options["unisat-domain"],
    "unisat-network": options["unisat-network"],
    "unisat-status": options["unisat-status"],
    "unisat-readonly": options["unisat-readonly"],
    "unisat-requires-confirmation": options["unisat-requires-confirmation"],
  });
  const all = parseBooleanOption(options.all);
  const limit = all ? items.length : Math.max(1, toInt(options.limit, 50));
  const page = Math.max(1, toInt(options.page, 1));
  const start = options.start === undefined ? (page - 1) * limit : Math.max(0, toInt(options.start, 0));
  const pagedItems = all ? items : items.slice(start, start + limit);
  const nextStart = !all && start + limit < items.length ? start + limit : null;

  return {
    command: "commands",
    mode: "list",
    filters: {
      domain: options.domain,
      file: options.file,
      method: options.method,
      tag: options.tag,
      unisatDomain: options["unisat-domain"],
      unisatNetwork: options["unisat-network"],
      unisatStatus: options["unisat-status"],
      unisatReadonly: options["unisat-readonly"],
      unisatRequiresConfirmation: options["unisat-requires-confirmation"],
    },
    pagination: {
      all,
      total: items.length,
      start: all ? 0 : start,
      limit: all ? items.length : limit,
      count: pagedItems.length,
      nextStart,
      nextCommand: buildCommandsPageCommand(options, nextStart, limit),
    },
    total: items.length,
    count: pagedItems.length,
    items: pagedItems,
  };
}

async function main() {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  const [domain, action] = positionals;

  if (options.version || options.v || domain === "version") {
    console.log(version);
    return;
  }

  if (options.help || options.h || domain === "help") {
    if (domain === "commands") {
      printCommandsHelp();
      return;
    }
    if (domain === "config") {
      printConfigHelp();
      return;
    }
    if (domain === "swagger") {
      printSwaggerHelp();
      return;
    }
    if (domain === "api" && (action === "call" || action === "help" || !action)) {
      printApiCallHelp();
      return;
    }
    if (!domain || domain === "help") {
      printHelp();
      return;
    }
    await initializeSwaggerCache();
    const operation = getOperationCommand(domain);
    if (operation) {
      printOperationHelp(operation);
      return;
    }
    printHelp();
    return;
  }

  if (!domain) {
    printHelp();
    return;
  }

  const format = options.format || "text";
  if (format !== "text" && format !== "json") {
    fail("unsupported --format, use text or json");
  }

  if (domain === "swagger" && action === "status") {
    printOutput(
      { command: "swagger.status", mode: "detail", ...getSwaggerCacheStatus() },
      format
    );
    return;
  }

  if (domain === "swagger" && action === "refresh") {
    const status = await refreshSwaggerCache({ force: parseBooleanOption(options.force) });
    printOutput(
      { command: "swagger.refresh", mode: "detail", ...status },
      format
    );
    return;
  }

  if (domain === "commands") {
    await initializeSwaggerCache();
    printOutput(commandsPayload(options), format);
    return;
  }

  let operation = null;
  if (domain !== "api" && domain !== "config" && domain !== "swagger") {
    await initializeSwaggerCache();
    operation = getOperationCommand(domain);
  }
  if (operation) {
    if (options.help) {
      printOperationHelp(operation);
      return;
    }
    const environmentName = options.env || DEFAULT_OPENAPI_ENVIRONMENT;
    const environment = getOpenApiEnvironment(environmentName);
    if (!environment) {
      fail("unsupported --env, use bitcoin or fractal");
    }
    const { apiKey, apiKeySource } = resolveApiKey(options, environment);
    const payload = await runOperationCommand(operation, options, apiKey, apiKeySource);
    printOutput(payload, format);
    if (payload.mode === "missing_api_key" || payload.mode === "api_key_error" || payload.mode === "missing_required_params") {
      process.exit(1);
    }
    if (payload.response && !payload.response.ok) {
      process.exit(1);
    }
    return;
  }

  if (domain === "api" && action === "call") {
    if (!options.path) {
      fail("api call requires --path");
    }
    await initializeSwaggerCache();

    const environmentName = options.env || DEFAULT_OPENAPI_ENVIRONMENT;
    const environment = getOpenApiEnvironment(environmentName);
    if (!environment) {
      fail("unsupported --env, use bitcoin or fractal");
    }
    const { apiKey, apiKeySource } = resolveApiKey(options, environment);
    const payload = await callApi({
      apiPath: options.path,
      apiKey,
      apiKeySource,
      environment: environment.name,
      query: options.query,
      queryParamsList: options["query-param"],
      pathParams: options["path-params"],
      pathParamsList: options["path-param"],
      body: options.body,
      dryRun: parseBooleanOption(options["dry-run"]),
    });
    printOutput(payload, format);
    if (payload.mode === "missing_api_key" || payload.mode === "api_key_error") {
      process.exit(1);
    }
    if (payload.mode !== "detail" || payload.response.ok) {
      return;
    }
    process.exit(1);
  }

  if (domain === "config" && (action === "bitcoin-key" || action === "fractal-key")) {
    if (!options["api-key"]) {
      failPayload(
        {
          command: `config.${action}`,
          mode: "missing_required_option",
          option: "api-key",
          message: `config ${action} requires --api-key`,
          recoverable: true,
          nextAction: `Re-run with --api-key <key>.`,
        },
        format,
        `config ${action} requires --api-key`
      );
    }
    const environment = getOpenApiEnvironment(action === "bitcoin-key" ? "bitcoin" : "fractal");
    const result = upsertDotEnvValue(environment.apiKeyEnv, options["api-key"]);
    printOutput(
      {
        command: `config.${action}`,
        mode: "saved",
        environment: environment.name,
        keyEnv: environment.apiKeyEnv,
        envPath: result.envPath,
      },
      format
    );
    return;
  }

  if (format === "json") {
    failPayload(
      {
        command: domain,
        mode: "unknown_command",
        message: `Unknown command: ${domain}`,
        recoverable: true,
        nextAction: "Run unisat-openapi-cli --help or unisat-openapi-cli commands --format json.",
      },
      format
    );
  }

  printHelp();
  process.exit(1);
}

main().catch((error) => {
  fail(error.message);
});
