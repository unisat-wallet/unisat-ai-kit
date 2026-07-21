#!/usr/bin/env node

const { parseArgs } = require("../src/arg-utils");
const { callApi } = require("../src/api-call");
const { getConfiguredValue, upsertDotEnvValue } = require("../src/env-file");
const { DEFAULT_OPENAPI_ENVIRONMENT, getOpenApiEnvironment } = require("../src/openapi-environments");
const { printOutput } = require("../src/format-utils");

const GUIDE_NOTES = [
  "Use --format json when another agent or script needs stable machine-readable output.",
  "api call requires an exact OpenAPI path. The CLI does not discover, match, or recommend interfaces.",
  "api call reads keys in this order: --api-key, process env, user config .env.",
  "config bitcoin-key / config fractal-key writes keys to a user config .env for Windows, Linux, and macOS.",
];

function printHelp() {
  console.log("UniSat AI Kit CLI");
  console.log("");
  console.log("Environments:");
  console.log("  bitcoin -> https://open-api.unisat.io -> UNISAT_BITCOIN_API_KEY");
  console.log("  fractal -> https://open-api-fractal.unisat.io -> UNISAT_FRACTAL_API_KEY");
  console.log("");
  console.log("Recommended flow:");
  console.log("  0. Find the exact OpenAPI path in swagger/*.yaml or the UniSat OpenAPI Agent Skill.");
  console.log("  1. config bitcoin-key --api-key <key>");
  console.log("  2. api call --env bitcoin --path <api-path> [params...]");
  console.log("");
  console.log("Commands:");
  console.log("  config bitcoin-key --api-key <key> [--format text|json]");
  console.log("  config fractal-key --api-key <key> [--format text|json]");
  console.log("  api call --path <api-path> [--env bitcoin|fractal] [--query-param k=v ...] [--path-param k=v ...] [--query \"a=1&b=2\"] [--path-params \"id=1\"] [--body '{\"x\":1}'] [--api-key <key>] [--format text|json]");
  console.log("");
  console.log("Notes:");
  GUIDE_NOTES.forEach((note) => console.log(`  - ${note}`));
  console.log("");
  console.log("Complete examples:");
  console.log("  config bitcoin-key --api-key YOUR_BITCOIN_KEY");
  console.log("  api call --env bitcoin --path \"/v1/price/btc\" --format json");
  console.log("  api call --env bitcoin --path \"/v1/indexer/address/{address}/balance\" --path-param address=YOUR_ADDRESS --format json");
  console.log("  config fractal-key --api-key YOUR_FRACTAL_KEY");
  console.log("  api call --env fractal --path \"/v1/public/fractal/supply\" --format json");
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

function printApiCallHelp() {
  printCommandHelp([
    "usage: api call --path <api-path> [--env bitcoin|fractal] [--query-param k=v ...] [--path-param k=v ...] [--query \"a=1&b=2\"] [--path-params \"id=1\"] [--body '{\"x\":1}'] [--api-key <key>] [--format text|json]",
    "",
    "Call a UniSat OpenAPI interface directly. The path must already be known; this CLI does not match natural language to interfaces.",
    "Reads API key from --api-key first, then process env, then user config .env.",
    "",
    "examples:",
    "  api call --env bitcoin --path \"/v1/price/btc\" --format json",
    "  api call --env bitcoin --path \"/v1/indexer/address/{address}/balance\" --path-param address=YOUR_ADDRESS --format json",
    "  api call --env fractal --path \"/v1/public/fractal/supply\" --format json",
  ]);
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
    if (domain === "config") {
      printConfigHelp();
      return;
    }
    if (domain === "api" && (action === "call" || action === "help")) {
      printApiCallHelp();
      return;
    }
    printHelp();
    return;
  }

  if (domain === "api" && action === "call") {
    if (!options.path) {
      fail("api call requires --path");
    }

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
