#!/usr/bin/env node

const { parseArgs, parseBooleanOption, toInt } = require("../src/arg-utils");
const fs = require("fs");
const { version } = require("../package.json");
const { callApi } = require("../src/api-call");
const { resolveConfiguredKey, getConfigStatus, upsertDotEnvValue } = require("../src/env-file");
const { withRecovery } = require("../src/result-utils");
const { DEFAULT_OPENAPI_ENVIRONMENT, getOpenApiEnvironment } = require("../src/openapi-environments");
const { getSwaggerContext } = require("../src/openapi-utils");
const { listOperationCommands, getOperationCommand } = require("../src/operation-commands");
const { buildExampleCommand, runOperationCommand } = require("../src/operation-runner");
const { printOutput } = require("../src/format-utils");
const cliContext = { command: "cli", format: "text" };

const GUIDE_NOTES = [
  "Use text for quick discovery lists; use --format json when structured parsing is needed.",
  "Start with commands domains, then commands --domain <domain> for a short command list.",
  "Read <command> --help for details; JSON changes the format, not the list's detail level.",
  "Use <api-command> --help, then --dry-run before real API calls.",
  "API keys are read from --api-key, process env, then user config .env.",
];

function getSwaggerPathHint() {
  const context = getSwaggerContext();
  return context.embedded ? "embedded OpenAPI swagger asset" : `${context.swaggerDir}/*.yaml`;
}

function printHelp() {
  const swaggerPathHint = getSwaggerPathHint();
  console.log("UniSat OpenAPI CLI");
  console.log("Query blockchain data, call UniSat business APIs, and inspect API key quota and usage.");
  console.log("API keys authorize service access; they do not provide wallet signing authority.");
  console.log("");
  console.log("Usage:");
  console.log("  unisat-openapi-cli <command> [options]");
  console.log("  unisat-openapi-cli --help");
  console.log("  unisat-openapi-cli -h");
  console.log("  unisat-openapi-cli help");
  console.log("");
  console.log("Fixed CLI commands:");
  console.log("  config status --env bitcoin|fractal --format json");
  console.log("      Inspect key presence and source locally without revealing keys or making network calls.");
  console.log("  getCredits --env bitcoin|fractal --format json");
  console.log("      Get current key limits, usage, and expireTime (Unix seconds; 0 means no expiration).");
  console.log("      Uses the configured key; see getCredits --help for fields and options.");
  console.log("  commands");
  console.log("      List command names, business domains, and short summaries. Use commands domains to see categories.");
  console.log("  config bitcoin-key --api-key <key>");
  console.log("      Save the Bitcoin OpenAPI API key.");
  console.log("  config fractal-key --api-key <key>");
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
  printCommandHelp([
    "", "First use:",
    "  1. Choose --env bitcoin or --env fractal explicitly (both are mainnets; default: bitcoin).",
    "  2. Run config status --env <environment> --format json. Configured does not mean valid.",
    "     Obtain a key at https://developer.unisat.io/ if needed; ask the user to configure it.",
    "     Prefer environment variables or user config; never commit keys or echo them into chat.",
    "  3. Run getCredits --env <environment> --format json to check quota, usage, and expireTime.",
    "     Check before the first call or a batch, not before every request.",
    "  4. Run commands domains, then commands --domain <domain>, then <command> --help.",
    "     Domains are business categories (e.g. blockchain), not network filters. Use --env on API calls.",
    "     Text is sufficient for discovery; use --format json when structured parsing is needed.",
    "  5. Supply required inputs and run <command> --env <environment> --dry-run --format json.",
    "  6. Execute; supply --confirm only when required and explicitly authorized by the user.",
    "", "Limits and output:",
    "  Help, command discovery, config status, and dry-run need no API key or network access.",
    "  Only Bitcoin and Fractal mainnets are supported; commands depend on CLI version and key permissions.",
    "  Dry-run validates required inputs and JSON syntax, not credentials, balances, or all business fields.",
    "  Both API commands and api call enforce required inputs and operation confirmation rules.",
    "  Credits measure backend consumption, not necessarily request count; expireTime is Unix seconds; 0 means no expiration, not unlimited quota.",
    "  Preserve zero/missing quota fields; do not infer unlimited usage from them.",
    "  Requests time out after 30 seconds. No automatic retries; check write status before resubmitting.",
    "  JSON mode writes one JSON object to stdout. Success exits 0; failure exits nonzero.",
    "  Unsafe integers and numbers that lose decimal precision are returned as exact JSON strings.",
    "  Keep these strings for BigInt/decimal arithmetic; do not coerce them to Number. Request JSON is sent unchanged.",
    "  Check mode, retryable, and nextAction on failures; response.body contains the original API result.",
  ]);
}

function printCommandHelp(lines) {
  lines.forEach((line) => console.log(line));
}

function printConfigHelp() {
  printCommandHelp([
    "Usage:",
    "  unisat-openapi-cli config status [--env bitcoin|fractal] [--api-key <key>] [--format json]",
    "  unisat-openapi-cli config bitcoin-key --api-key <key> [options]",
    "  unisat-openapi-cli config fractal-key --api-key <key> [options]",
    "",
    "Description:",
    "  Save API keys into a user config .env file so they work on Windows, Linux, and macOS shells.",
    "  config status reports version, selected environment, config path, and key presence/source.",
    "  Sources: argument > environment > user_config > none. --api-key applies only to the selected environment.",
    "  Status never reveals keys or calls the network; validity remains not_checked. Use getCredits for an online check.",
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
    "  unisat-openapi-cli commands domains [--format text|json]",
    "",
    "Description:",
    "  List compact command summaries in both text and JSON. Parameters and detailed metadata are omitted.",
    "  First run commands domains to see valid business categories and command counts.",
    "  Then list a category and use <command> --help [--format json] for that command's full metadata.",
    "",
    "Options:",
    "  --domain <domain>",
    "      Filter by business category, such as blockchain, brc20, alkanes, or runes.",
    "      bitcoin is a network, not a domain. Use --env on the selected API command, not on commands.",
    "      The fractal domain contains Fractal-specific public APIs; it does not list all APIs available on Fractal.",
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
    "      Page size. Defaults to 20.",
    "  --start <number>",
    "      Start offset. Defaults to 0.",
    "  --page <number>",
    "      1-based page number. Ignored when --start is provided.",
    "  --all",
    "      Return all matched summaries without pagination; this does not include command details.",
    "      Unfiltered --all --format json can produce very large output that exceeds agent context or tool output limits and gets truncated.",
    "      Filter with --domain, --file, or --tag first, or omit --all and use --page/--limit for pagination.",
    "  --format text|json",
    "      Output format. Use json for agents and scripts.",
    "  --help",
    "      Show this help message.",
    "",
    "Examples:",
    "  unisat-openapi-cli commands domains",
    "  unisat-openapi-cli commands --domain blockchain",
    "  unisat-openapi-cli getBlockchainInfo --help --format json",
    "  unisat-openapi-cli commands --page 2 --limit 20 --format json",
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
    "  --body-file <path>",
    "      Read UTF-8 JSON from a file, avoiding shell quoting issues. Mutually exclusive with --body.",
    "  --confirm",
    "      Execute an operation requiring confirmation only after explicit user authorization.",
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
    console.log("  --body-file <path> - Read UTF-8 JSON from a file instead of --body; recommended for PowerShell and complex JSON.");
    if (Array.isArray(operation.requestBody?.contentTypes) && operation.requestBody.contentTypes.length > 0) {
      console.log(`  content-types: ${operation.requestBody.contentTypes.join(", ")}`);
    }
    if (operation.requestBody.definitionYaml) {
      console.log("  OpenAPI body definition (YAML below; pass a JSON value to --body):");
      console.log(operation.requestBody.definitionYaml);
      for (const [ref, definition] of Object.entries(operation.requestBody.referencedSchemas || {})) {
        console.log(`Referenced definition ${ref}:`);
        console.log(definition);
      }
      if (operation.requestBody.unresolvedReferences?.length) {
        console.log(`Unresolved definitions: ${operation.requestBody.unresolvedReferences.join(", ")}. Obtain these definitions before constructing the body.`);
      }
      console.log("  Use required fields and documented types; dry-run checks JSON syntax, not full schema or transaction safety.");
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

function resolveApiKey(options, environment) {
  return resolveConfiguredKey(environment, options["api-key"]);
}

function fail(message, mode = "invalid_arguments") {
  failPayload({ command: cliContext.command, mode, message }, cliContext.format);
}

function failPayload(payload, format, textFallback) {
  payload = withRecovery(payload);
  if (format === "json") {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error(textFallback || payload.message || payload.mode || "command failed");
  }
  process.exit(1);
}

function showHelp(render, ...args) {
  if (cliContext.format !== "json") return render(...args);
  const lines = [];
  const originalLog = console.log;
  try {
    console.log = (...parts) => lines.push(parts.join(" "));
    render(...args);
  } finally {
    console.log = originalLog;
  }
  printOutput({ command: cliContext.command, mode: "help", text: lines.join("\n"),
    ...(render === printOperationHelp ? { operation: args[0] } : {}) }, "json");
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
  flags.push(`--format ${options.format || "text"}`);
  return `unisat-openapi-cli commands ${flags.join(" ")}`;
}

function commandDomainsPayload() {
  const counts = new Map();
  listOperationCommands().forEach((operation) => counts.set(operation.domain, (counts.get(operation.domain) || 0) + 1));
  return { command: "commands.domains", mode: "list",
    items: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([domain, count]) => ({ domain, count })),
    nextAction: "Use commands --domain <domain> for summaries, then <command> --help for details. Domains are business categories; bitcoin/fractal are request environments." };
}

function commandsPayload(options) {
  const availableDomains = commandDomainsPayload().items.map((item) => item.domain);
  if (options.domain && !availableDomains.includes(options.domain)) {
    const isNetwork = ["bitcoin", "fractal"].includes(options.domain);
    return { command: "commands", mode: "invalid_domain", domain: options.domain, availableDomains,
      message: isNetwork ? `${options.domain} is a network environment, not a business domain.` : "Unknown business domain.",
      nextAction: isNetwork
        ? "For chain state, use commands --domain blockchain. Select the network with --env on the API command. Run commands domains for all business categories."
        : "Choose an availableDomains value, or run commands domains to list business categories." };
  }
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
  const limit = all ? items.length : Math.max(1, toInt(options.limit, 20));
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
    items: pagedItems.map(({ commandName, domain, summary, recommendation }) => ({
      commandName, domain, summary, ...(recommendation ? { recommendation } : {}),
    })),
    nextAction: items.length === 0
      ? "No commands match these filters. Run commands domains or relax the filters."
      : "Use <commandName> --help for parameters and safety rules; add --format json for full structured command metadata.",
  };
}

async function main() {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  const [domain, action] = positionals;
  cliContext.command = domain === "api" || domain === "config" ? `${domain}.${action || "help"}` : domain || "cli";
  cliContext.format = options.format || "text";
  const format = cliContext.format;
  if (format !== "text" && format !== "json") fail("unsupported --format, use text or json");

  if (options.version || options.v || domain === "version") {
    if (format === "json") printOutput({ command: "version", mode: "version", version }, format);
    else console.log(version);
    return;
  }

  if (options.help || options.h || domain === "help") {
    if (domain === "commands") {
      showHelp(printCommandsHelp);
      return;
    }
    if (domain === "config") {
      showHelp(printConfigHelp);
      return;
    }
    if (domain === "api" && (action === "call" || action === "help" || !action)) {
      showHelp(printApiCallHelp);
      return;
    }
    const operation = domain ? getOperationCommand(domain) : null;
    if (operation) {
      showHelp(printOperationHelp, operation);
      return;
    }
    showHelp(printHelp);
    return;
  }

  if (!domain) {
    showHelp(printHelp);
    return;
  }

  if (domain === "config" && action === "status") {
    const environment = getOpenApiEnvironment(options.env || DEFAULT_OPENAPI_ENVIRONMENT);
    if (!environment) fail("unsupported --env, use bitcoin or fractal", "invalid_environment");
    printOutput(getConfigStatus(environment, options["api-key"]), format);
    return;
  }

  if (domain === "commands") {
    if (action && action !== "domains") fail("Unknown commands subcommand. Use commands domains or commands --help.");
    if (options.env !== undefined) fail("--env selects a network on API calls. Use commands domains to discover business categories.");
    const payload = action === "domains" ? commandDomainsPayload() : commandsPayload(options);
    printOutput(payload, format);
    if (payload.mode !== "list") process.exit(1);
    return;
  }

  const operation = getOperationCommand(domain);
  if (options["body-file"] !== undefined && (operation || (domain === "api" && action === "call"))) {
    if (options.body !== undefined) fail("Use only one of --body and --body-file.", "invalid_body");
    if (typeof options["body-file"] !== "string") fail("Supply exactly one --body-file path.", "invalid_body");
    try {
      options.body = fs.readFileSync(options["body-file"], "utf8").replace(/^\uFEFF/, "");
    } catch {
      fail("Cannot read --body-file. Supply a readable UTF-8 JSON file.", "invalid_body");
    }
    delete options["body-file"];
  }
  if (operation) {
    const environmentName = options.env || DEFAULT_OPENAPI_ENVIRONMENT;
    const environment = getOpenApiEnvironment(environmentName);
    if (!environment) {
      fail("unsupported --env, use bitcoin or fractal", "invalid_environment");
    }
    const { apiKey, apiKeySource } = resolveApiKey(options, environment);
    const payload = await runOperationCommand(operation, options, apiKey, apiKeySource);
    printOutput(payload, format);
    if (!["detail", "plan"].includes(payload.mode) || (payload.response && !payload.response.ok)) {
      process.exit(1);
    }
    return;
  }

  if (domain === "api" && action === "call") {
    if (!options.path) {
      fail("api call requires --path");
    }

    const environmentName = options.env || DEFAULT_OPENAPI_ENVIRONMENT;
    const environment = getOpenApiEnvironment(environmentName);
    if (!environment) {
      fail("unsupported --env, use bitcoin or fractal", "invalid_environment");
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
      confirm: parseBooleanOption(options.confirm),
    });
    printOutput(payload, format);
    if (!["detail", "plan"].includes(payload.mode) || (payload.response && !payload.response.ok)) {
      process.exit(1);
    }
    return;
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
  const mode = error instanceof URIError ? "invalid_parameters"
    : error instanceof SyntaxError ? "invalid_body" : "internal_error";
  fail(mode === "invalid_parameters" ? "Invalid parameter encoding."
    : mode === "invalid_body" ? "Invalid JSON input."
      : "CLI could not complete the command. Check local configuration and file access.", mode);
});
