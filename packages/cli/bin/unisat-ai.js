#!/usr/bin/env node

const { parseArgs, toInt } = require("../src/arg-utils");
const { searchDocs } = require("../src/docs-search");
const { explainOpenApi } = require("../src/openapi-explain");
const { explainErrorByCode, explainErrorByQuery } = require("../src/error-explain");
const { generateSnippet } = require("../src/snippet-generate");
const { printOutput } = require("../src/format-utils");

function printHelp() {
  console.log("UniSat AI CLI");
  console.log("");
  console.log("Commands:");
  console.log("  docs search --query <text> [--limit 5] [--format text|json]");
  console.log("  openapi explain --path <api-path> [--format text|json]");
  console.log("  openapi explain --keyword <text> [--format text|json]");
  console.log("  error explain --code <negative-int> [--format text|json]");
  console.log("  error explain --query <text> [--limit 5] [--format text|json]");
  console.log("  snippet generate --path <api-path> [--language curl|typescript] [--format text|json]");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function main() {
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

  printHelp();
  process.exit(1);
}

main();
