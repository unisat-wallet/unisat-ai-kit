#!/usr/bin/env node

const { parseArgs, toInt } = require("../src/arg-utils");
const { searchDocs } = require("../src/docs-search");
const { explainOpenApi } = require("../src/openapi-explain");
const { explainErrorByCode, explainErrorByQuery } = require("../src/error-explain");
const { generateSnippet } = require("../src/snippet-generate");
const { callApi } = require("../src/api-call");
const {
  introCapabilities,
  introGuide,
  introDomains,
  introExample,
  introFind,
  introList,
  introParams,
  introResolve,
  introRelated,
  introShow,
  introTask,
  introTasks,
} = require("../src/intro");
const { printOutput } = require("../src/format-utils");

function printHelp() {
  console.log("UniSat AI CLI");
  console.log("");
  console.log("Recommended flow:");
  console.log("  1. intro guide");
  console.log("  2. intro resolve --query <task>");
  console.log("  3. api call ...");
  console.log("");
  console.log("Commands:");
  console.log("  docs search --query <text> [--limit 5] [--format text|json]");
  console.log("  openapi explain --path <api-path> [--format text|json]");
  console.log("  openapi explain --keyword <text> [--format text|json]");
  console.log("  error explain --code <negative-int> [--format text|json]");
  console.log("  error explain --query <text> [--limit 5] [--format text|json]");
  console.log("  snippet generate --path <api-path> [--language curl|typescript] [--format text|json]");
  console.log("  api call --path <api-path> [--query-param k=v ...] [--path-param k=v ...] [--query \"a=1&b=2\"] [--path-params \"id=1\"] [--body '{\"x\":1}'] [--api-key <key>] [--format text|json]");
  console.log("  intro list [--domain <name>] [--method <verb>] [--keyword <text>] [--format text|json]");
  console.log("  intro show --path <api-path> [--format text|json]");
  console.log("  intro find --query <text> [--format text|json]");
  console.log("  intro resolve [--query <text> | --path <api-path>] [--shell powershell|bash] [--top 5] [--format text|json]");
  console.log("  intro params --path <api-path> [--format text|json]");
  console.log("  intro example --path <api-path> [--shell powershell|bash] [--format text|json]");
  console.log("  intro domains [--format text|json]");
  console.log("  intro related --path <api-path> [--format text|json]");
  console.log("  intro guide [--format text|json]");
  console.log("  intro capabilities [--format text|json]");
  console.log("  intro tasks [--format text|json]");
  console.log("  intro task --name <task-name> [--shell powershell|bash] [--format text|json]");
}

function printCommandHelp(lines) {
  lines.forEach((line) => console.log(line));
}

function printIntroHelp() {
  printCommandHelp([
    "intro commands:",
    "  intro list [--domain <name>] [--method <verb>] [--keyword <text>] [--format text|json]",
    "  intro show --path <api-path> [--format text|json]",
    "  intro find --query <text> [--format text|json]",
    "  intro resolve [--query <text> | --path <api-path>] [--shell powershell|bash] [--top 5] [--format text|json]",
    "  intro params --path <api-path> [--format text|json]",
    "  intro example --path <api-path> [--shell powershell|bash] [--format text|json]",
    "  intro domains [--format text|json]",
    "  intro related --path <api-path> [--format text|json]",
    "  intro guide [--format text|json]",
    "  intro capabilities [--format text|json]",
    "  intro tasks [--format text|json]",
    "  intro task --name <task-name> [--shell powershell|bash] [--format text|json]",
  ]);
}

function printIntroResolveHelp() {
  printCommandHelp([
    "usage: intro resolve [--query <text> | --path <api-path>] [--shell powershell|bash] [--top 5] [--format text|json]",
    "",
    "Resolve the best interface, parameters, and runnable example in one step.",
    "",
    "examples:",
    "  intro resolve --query \"address brc20 balance list\"",
    "  intro resolve --path \"/v1/indexer/address/{address}/brc20/summary\" --shell powershell",
  ]);
}

function printIntroFindHelp() {
  printCommandHelp([
    "usage: intro find --query <text> [--format text|json]",
    "",
    "Find candidate interfaces from a natural-language task.",
    "",
    "example:",
    "  intro find --query \"address runes balance list\"",
  ]);
}

function printApiCallHelp() {
  printCommandHelp([
    "usage: api call --path <api-path> [--query-param k=v ...] [--path-param k=v ...] [--query \"a=1&b=2\"] [--path-params \"id=1\"] [--body '{\"x\":1}'] [--api-key <key>] [--format text|json]",
    "",
    "Call a UniSat OpenAPI interface directly.",
    "",
    "examples:",
    "  api call --path \"/v1/price/btc\" --format json",
    "  api call --path \"/v1/indexer/address/{address}/brc20/summary\" --path-param address=YOUR_ADDRESS --query-param start=0 --query-param limit=16",
  ]);
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
    if (domain === "intro" && action === "resolve") {
      printIntroResolveHelp();
      return;
    }
    if (domain === "intro" && action === "find") {
      printIntroFindHelp();
      return;
    }
    if (domain === "api" && (action === "call" || action === "help")) {
      printApiCallHelp();
      return;
    }
    printHelp();
    return;
  }

  if (domain === "docs" && action === "search") {
    if (!options.query) {
      fail("docs search requires --query");
    }
    const payload = searchDocs(options.query, toInt(options.limit, 5));
    printOutput(payload, format);
    return;
  }

  if (domain === "openapi" && action === "explain") {
    if (!options.path && !options.keyword) {
      fail("openapi explain requires --path or --keyword");
    }
    const payload = explainOpenApi({
      apiPath: options.path,
      keyword: options.keyword,
    });
    printOutput(payload, format);
    return;
  }

  if (domain === "error" && action === "explain") {
    if (!options.code && !options.query) {
      fail("error explain requires --code or --query");
    }

    const payload = options.code
      ? explainErrorByCode(options.code)
      : explainErrorByQuery(options.query, toInt(options.limit, 5));
    printOutput(payload, format);
    return;
  }

  if (domain === "snippet" && action === "generate") {
    if (!options.path) {
      fail("snippet generate requires --path");
    }

    const language = options.language || "curl";
    if (language !== "curl" && language !== "typescript") {
      fail("snippet generate supports curl or typescript");
    }

    const payload = generateSnippet({
      apiPath: options.path,
      language,
    });
    printOutput(payload, format);
    return;
  }

  if (domain === "api" && action === "call") {
    if (!options.path) {
      fail("api call requires --path");
    }

    const apiKey = options["api-key"] || process.env.UNISAT_API_KEY;

    const payload = await callApi({
      apiPath: options.path,
      apiKey,
      apiKeySource: options["api-key"] ? "--api-key" : "UNISAT_API_KEY",
      baseUrl: options["base-url"],
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

  if (domain === "intro" && action === "list") {
    const payload = introList({
      domain: options.domain,
      method: options.method,
      keyword: options.keyword,
    });
    printOutput(payload, format);
    return;
  }

  if (domain === "intro" && action === "show") {
    if (!options.path) {
      fail("intro show requires --path");
    }
    printOutput(introShow(options.path), format);
    return;
  }

  if (domain === "intro" && action === "find") {
    if (!options.query) {
      fail("intro find requires --query");
    }
    printOutput(introFind(options.query), format);
    return;
  }

  if (domain === "intro" && action === "resolve") {
    if (!options.query && !options.path) {
      fail("intro resolve requires --query or --path");
    }
    const shell = options.shell || "powershell";
    if (shell !== "powershell" && shell !== "bash") {
      fail("intro resolve supports powershell or bash");
    }
    const top = toInt(options.top, 5);
    printOutput(
      introResolve({
        query: options.query,
        apiPath: options.path,
        shell,
        top,
      }),
      format
    );
    return;
  }

  if (domain === "intro" && action === "params") {
    if (!options.path) {
      fail("intro params requires --path");
    }
    printOutput(introParams(options.path), format);
    return;
  }

  if (domain === "intro" && action === "example") {
    if (!options.path) {
      fail("intro example requires --path");
    }
    const shell = options.shell || "powershell";
    if (shell !== "powershell" && shell !== "bash") {
      fail("intro example supports powershell or bash");
    }
    printOutput(introExample(options.path, shell), format);
    return;
  }

  if (domain === "intro" && action === "domains") {
    printOutput(introDomains(), format);
    return;
  }

  if (domain === "intro" && action === "guide") {
    printOutput(introGuide(), format);
    return;
  }

  if (domain === "intro" && action === "capabilities") {
    printOutput(introCapabilities(), format);
    return;
  }

  if (domain === "intro" && action === "tasks") {
    printOutput(introTasks(), format);
    return;
  }

  if (domain === "intro" && action === "task") {
    if (!options.name) {
      fail("intro task requires --name");
    }
    const shell = options.shell || "powershell";
    if (shell !== "powershell" && shell !== "bash") {
      fail("intro task supports powershell or bash");
    }
    printOutput(introTask(options.name, shell), format);
    return;
  }

  if (domain === "intro" && action === "related") {
    if (!options.path) {
      fail("intro related requires --path");
    }
    printOutput(introRelated(options.path), format);
    return;
  }

  printHelp();
  process.exit(1);
}

main().catch((error) => {
  fail(error.message);
});
