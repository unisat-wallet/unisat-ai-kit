#!/usr/bin/env node

const { parseArgs, toInt } = require("../src/arg-utils");
const { callApi } = require("../src/api-call");
const { getConfiguredValue, upsertDotEnvValue } = require("../src/env-file");
const { DEFAULT_OPENAPI_ENVIRONMENT, getOpenApiEnvironment } = require("../src/openapi-environments");
const { introResolve, introShow } = require("../src/intro");
const { printOutput } = require("../src/format-utils");
const {
  ensureSwaggerCache,
  getSwaggerCacheStatus,
  refreshSwaggerCache,
} = require("../src/swagger-cache");

const GUIDE_NOTES = [
  "Use --format json when another agent or script needs stable machine-readable output.",
  "api call reads keys in this order: --api-key, process env, user config .env.",
  "config bitcoin-key / config fractal-key writes keys to a user config .env for Windows, Linux, and macOS.",
  "Use intro show only when you already know the exact API path and need raw interface detail.",
];

function printHelp() {
  console.log("UniSat AI Kit CLI");
  console.log("");
  console.log("Environments:");
  console.log("  bitcoin -> https://open-api.unisat.io -> UNISAT_BITCOIN_API_KEY");
  console.log("  fractal -> https://open-api-fractal.unisat.io -> UNISAT_FRACTAL_API_KEY");
  console.log("");
  console.log("Recommended flow:");
  console.log("  0. config bitcoin-key --api-key <key>");
  console.log("  1. intro resolve --env bitcoin --query <task> --format json");
  console.log("  2. Copy the api call command from intro resolve, replace placeholders, then run it.");
  console.log("");
  console.log("Commands:");
  console.log("  config bitcoin-key --api-key <key> [--format text|json]");
  console.log("  config fractal-key --api-key <key> [--format text|json]");
  console.log("  swagger status [--format text|json]");
  console.log("  swagger refresh [--force] [--format text|json]");
  console.log("  intro show --path <api-path> [--format text|json]");
  console.log("  intro resolve [--query <text> | --path <api-path>] [--env bitcoin|fractal] [--shell powershell|bash] [--top 5] [--format text|json]");
  console.log("  api call --path <api-path> [--env bitcoin|fractal] [--query-param k=v ...] [--path-param k=v ...] [--query \"a=1&b=2\"] [--path-params \"id=1\"] [--body '{\"x\":1}'] [--api-key <key>] [--format text|json]");
  console.log("");
  console.log("Notes:");
  GUIDE_NOTES.forEach((note) => console.log(`  - ${note}`));
  console.log("");
  console.log("Complete examples:");
  console.log("  config bitcoin-key --api-key YOUR_BITCOIN_KEY");
  console.log("  intro resolve --env bitcoin --query \"get btc address balance\" --format json");
  console.log("  api call --env bitcoin --path \"/v1/indexer/address/{address}/balance\" --path-param address=YOUR_ADDRESS --format json");
  console.log("  config fractal-key --api-key YOUR_FRACTAL_KEY");
  console.log("  intro resolve --env fractal --query \"get fractal address balance\" --format json");
}

function printCommandHelp(lines) {
  lines.forEach((line) => console.log(line));
}

function printConfigHelp() {
  printCommandHelp([
    "config commands:",
    "  config bitcoin-key --api-key <key> [--format text|json]",
    "  config fractal-key --api-key <key> [--format text|json]",
    "",
    "Stores keys in a user config .env file so they work on Windows, Linux, and macOS shells.",
    "",
    "Stored variables:",
    "  bitcoin -> UNISAT_BITCOIN_API_KEY",
    "  fractal -> UNISAT_FRACTAL_API_KEY",
    "",
    "examples:",
    "  config bitcoin-key --api-key YOUR_BITCOIN_KEY",
    "  config fractal-key --api-key YOUR_FRACTAL_KEY",
  ]);
}

function printIntroHelp() {
  printCommandHelp([
    "intro commands:",
    "  intro show --path <api-path> [--format text|json]",
    "  intro resolve [--query <text> | --path <api-path>] [--env bitcoin|fractal] [--shell powershell|bash] [--top 5] [--format text|json]",
  ]);
}

function printIntroResolveHelp() {
  printCommandHelp([
    "usage: intro resolve [--query <text> | --path <api-path>] [--env bitcoin|fractal] [--shell powershell|bash] [--top 5] [--format text|json]",
    "",
    "Resolve the best interface, parameters, and runnable example in one step.",
    "",
    "examples:",
    "  intro resolve --env bitcoin --query \"address brc20 balance list\"",
    "  intro resolve --env fractal --path \"/v1/public/address/{address}/balance\" --shell powershell",
  ]);
}

function printIntroShowHelp() {
  printCommandHelp([
    "usage: intro show --path <api-path> [--format text|json]",
    "",
    "Show raw OpenAPI detail for a known interface path.",
  ]);
}

function printApiCallHelp() {
  printCommandHelp([
    "usage: api call --path <api-path> [--env bitcoin|fractal] [--query-param k=v ...] [--path-param k=v ...] [--query \"a=1&b=2\"] [--path-params \"id=1\"] [--body '{\"x\":1}'] [--api-key <key>] [--format text|json]",
    "",
    "Call a UniSat OpenAPI interface directly.",
    "Reads API key from --api-key first, then process env, then user config .env.",
    "",
    "examples:",
    "  api call --env bitcoin --path \"/v1/price/btc\" --format json",
    "  api call --env bitcoin --path \"/v1/indexer/address/{address}/balance\" --path-param address=YOUR_ADDRESS --format json",
    "  api call --env fractal --path \"/v1/public/fractal/supply\" --format json",
  ]);
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

async function main() {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  const [domain, action] = positionals;

  if (!domain) {
    printHelp();
    return;
  }

  const format = options.format || "text";
  if (format !== "text" && format !== "json") {
    fail("unsupported --format, use text or json");
  }

  if (options.help) {
    if (domain === "intro" && !action) {
      printIntroHelp();
      return;
    }
    if (domain === "intro" && action === "show") {
      printIntroShowHelp();
      return;
    }
    if (domain === "intro" && action === "resolve") {
      printIntroResolveHelp();
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
    if (domain === "api" && (action === "call" || action === "help")) {
      printApiCallHelp();
      return;
    }
    printHelp();
    return;
  }

  if (domain === "swagger" && action === "status") {
    printOutput(
      { command: "swagger.status", mode: "detail", ...getSwaggerCacheStatus() },
      format
    );
    return;
  }

  if (domain === "swagger" && action === "refresh") {
    const status = await refreshSwaggerCache({ force: options.force === "true" });
    printOutput(
      { command: "swagger.refresh", mode: "detail", ...status },
      format
    );
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

  if (domain === "intro" && action === "show") {
    if (!options.path) {
      fail("intro show requires --path");
    }
    await initializeSwaggerCache();
    printOutput(introShow(options.path), format);
    return;
  }

  if (domain === "intro" && action === "resolve") {
    if (!options.query && !options.path) {
      fail("intro resolve requires --query or --path");
    }
    await initializeSwaggerCache();
    const shell = options.shell || "powershell";
    if (shell !== "powershell" && shell !== "bash") {
      fail("intro resolve supports powershell or bash");
    }
    printOutput(
      introResolve({
        query: options.query,
        apiPath: options.path,
        shell,
        environment: options.env || DEFAULT_OPENAPI_ENVIRONMENT,
        top: toInt(options.top, 5),
      }),
      format
    );
    return;
  }

  if (domain === "config" && (action === "bitcoin-key" || action === "fractal-key")) {
    if (!options["api-key"]) {
      fail(`config ${action} requires --api-key`);
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

  printHelp();
  process.exit(1);
}

main().catch((error) => {
  fail(error.message);
});
