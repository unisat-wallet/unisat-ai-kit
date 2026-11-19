import { testSwaggerDir } from "./test-swagger.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { callApi } = require("../packages/cli/src/api-call");
const { getOperationCommand } = require("../packages/cli/src/operation-commands");
const { registerTools } = require("../packages/mcp-server/src/tools");

import { withoutProxyEnvironment } from "./proxy-checks.mjs";

export async function runAgentChecks() {
  return withoutProxyEnvironment(runChecks);
}

async function runChecks() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "unisat-agent-checks-"));
  const envFile = path.join(tempDir, ".env");
  fs.writeFileSync(envFile, "UNISAT_BITCOIN_API_KEY=fake_file_btc\nUNISAT_FRACTAL_API_KEY=fake_file_fractal\n");
  const cli = (args, setup = "", env = {}) => {
    const code = `
      global.fetch = async () => { throw new Error('Unexpected network call'); };
      ${setup}
      process.argv = ['node', 'cli', ...${JSON.stringify([...args, "--format", "json"])}];
      require('./packages/cli/bin/unisat-ai.js');
    `;
    const result = spawnSync(process.execPath, ["-"], {
      cwd: rootDir, input: code, encoding: "utf8", timeout: 10000,
      env: { ...process.env, UNISAT_AI_KIT_ENV_FILE: envFile, UNISAT_BITCOIN_API_KEY: "", UNISAT_FRACTAL_API_KEY: "", ...env },
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    assert.equal(result.stderr, "", "JSON command errors must remain machine-readable on stdout");
    const payload = JSON.parse(result.stdout);
    assert.doesNotMatch(result.stdout, /fake_file_btc|fake_file_fractal|fake_env_key|fake_override_key|secret_body_value/);
    if (result.status !== 0) {
      assert.equal(typeof payload.retryable, "boolean");
      assert.equal(typeof payload.nextAction, "string");
    }
    return { status: result.status, payload };
  };
  const originalFetch = globalThis.fetch;
  try {
    let result = cli(["config", "status"]);
    assert.equal(result.status, 0);
    assert.equal(result.payload.networkChecked, false);
    assert.ok(result.payload.environments.every(item => item.configured && item.source === "user_config" && item.validity === "not_checked"));
    result = cli(["config", "status", "--env", "fractal", "--api-key", "fake_override_key"], "", { UNISAT_BITCOIN_API_KEY: "fake_env_key" });
    assert.equal(result.payload.environment, "fractal");
    assert.deepEqual(result.payload.environments.map(item => item.source), ["environment", "argument"]);
    fs.writeFileSync(envFile, "");
    result = cli(["config", "status"]);
    assert.ok(result.payload.environments.every(item => !item.configured && item.source === "none"));
    for (const args of [[], ["--help"], ["config", "status", "--help"], ["getCredits", "--help"], ["api", "call", "--help"]]) {
      assert.equal(cli(args).payload.mode, "help");
    }
    const help = cli(["--help"]).payload.text;
    for (const phrase of ["Commands:", "config status", "getCredits", "commands domains", "mainnets", "--confirm", "30 seconds"]) assert.ok(help.includes(phrase));
    assert.equal(cli(["--version"]).payload.mode, "version");
    const domains = cli(["commands", "domains"]).payload.items;
    assert.ok(domains.some((item) => item.domain === "blockchain" && item.count > 0));
    for (const domain of ["bitcoin", "typo-domain"]) {
      const invalid = cli(["commands", "--domain", domain]);
      assert.equal(invalid.status, 1);
      assert.equal(invalid.payload.mode, "invalid_domain");
      assert.ok(invalid.payload.availableDomains.includes("blockchain"));
    }
    assert.equal(cli(["commands", "--domain", "fractal"]).status, 0, "Fractal-specific APIs form a real business category");
    const empty = cli(["commands", "--domain", "blockchain", "--tag", "no-such-tag"]);
    assert.equal(empty.status, 0);
    assert.equal(empty.payload.total, 0, "Known domains with no matches are not invalid domains");
    const firstPage = cli(["commands"]).payload;
    assert.equal(firstPage.count, 20);
    assert.ok(JSON.stringify(firstPage).length < 10000, "Default discovery page must stay compact");
    const nextPage = cli(["commands", "--start", String(firstPage.pagination.nextStart)]).payload;
    assert.ok(!nextPage.items.some(item => firstPage.items.some(first => first.commandName === item.commandName)));
    const chainList = cli(["commands", "--domain", "blockchain", "--all"]).payload;
    assert.ok(chainList.items.some(item => item.commandName === "getBlockchainInfo"));
    assert.ok(chainList.items.every(item => Object.keys(item).every(key => ["commandName", "domain", "summary", "recommendation"].includes(key))));
    const chainHelp = cli(["getBlockchainInfo", "--help"]).payload.operation;
    assert.equal(chainHelp.path, "/v1/indexer/blockchain/info");
    assert.equal(chainHelp.readOnly, true);
    const auctionHelp = cli(["getBrc20AuctionList", "--help"]).payload;
    const auctionBody = auctionHelp.operation.requestBody;
    for (const field of ["filter", "sort", "start", "limit", "nftType", "tick", "unitPrice"]) {
      assert.ok(auctionBody.definitionYaml.includes(field), `Missing body field ${field}`);
      assert.ok(auctionHelp.text.includes(field), `Missing text help field ${field}`);
    }
    assert.doesNotMatch(auctionHelp.text, /--body='\{\}'/);
    const bidHelp = cli(["createBrc20BidPrepare", "--help"]).payload;
    const bidSchema = bidHelp.operation.requestBody.referencedSchemas["#/components/schemas/MarketCreateBidPrepareRequest"];
    assert.ok(bidSchema.includes("auctionId:"));
    assert.ok(bidHelp.text.includes(bidSchema));
    assert.equal(bidHelp.operation.requestBody.unresolvedReferences, undefined);
    const auctionRequest = { filter: { nftType: "brc20", tick: "ordi" }, sort: { unitPrice: 1 }, start: 0, limit: 1 };
    const auctionResult = cli(["getBrc20AuctionList", "--body", JSON.stringify(auctionRequest), "--api-key", "fake_override_key"], `
      global.fetch = async (url, options) => {
        require('node:assert/strict').deepEqual(JSON.parse(options.body), ${JSON.stringify(auctionRequest)});
        require('node:assert/strict').equal(options.method, 'POST');
        return Response.json({code:0,data:{list:[],total:0}});
      };
    `);
    assert.equal(auctionResult.status, 0);
    assert.equal(auctionResult.payload.safety.requiresConfirmation, false);
    assert.equal(cli(["commands", "--env", "bitcoin"]).status, 1);
    for (const args of [["api", "call"], ["getCredits", "--env", "testnet"], ["config", "status", "--env", "__proto__"], ["config", "bitcoin-key"]]) {
      assert.equal(cli(args).status, 1);
    }
    assert.equal(cli(["getCredits"]).payload.mode, "missing_api_key");
    assert.equal(cli(["api", "call", "--path", "/v1/brc20-swap/balance", "--query", "address=%"]).payload.mode, "invalid_parameters");

    const operation = getOperationCommand("createOrder");
    assert.ok(operation.requestBody.required && operation.requiresConfirmation);
    const direct = ["api", "call", "--path", operation.path];
    const semantic = ["createOrder"];
    const successFetch = "global.fetch = async () => Response.json({code: 0, data: {accepted: true}});";
    for (const command of [direct, semantic]) {
      assert.equal(cli([...command, "--dry-run"]).status, 1, "Both entries must require a body");
      assert.equal(cli([...command, "--body", '{"secret_body_value":', "--dry-run"]).payload.mode, "invalid_body");
      assert.equal(cli([...command, "--body", "null", "--dry-run"]).status, 1);
      assert.equal(cli([...command, "--body", "{}", "--dry-run=1"]).payload.mode, "plan");
      assert.equal(cli([...command, "--body", "{}", "--api-key", "fake_override_key"], successFetch).payload.mode, "confirmation_required");
      assert.equal(cli([...command, "--body", "{}", "--api-key", "fake_override_key", "--confirm"], successFetch).status, 0);
    }
    const handlers = {};
    registerTools({ registerTool(name, meta, handler) { handlers[name] = handler; } });
    const discovery = (await handlers.list_operations({ query: "brc20", limit: 2 })).structuredContent;
    assert.equal(discovery.operations.length, 2);
    assert.equal(discovery.nextOffset, 2);
    const mcpNextPage = (await handlers.list_operations({ query: "brc20", offset: 2, limit: 2 })).structuredContent;
    assert.notEqual(mcpNextPage.operations[0].commandName, discovery.operations[0].commandName);
    assert.equal((await handlers.list_operations({ domain: "bitcoin" })).structuredContent.total, 0);
    const inspected = await handlers.get_operation({ operation: operation.path });
    assert.equal(inspected.structuredContent.operation.requiresConfirmation, true);
    assert.ok(inspected.structuredContent.operation.requestBody.definitionYaml);
    assert.equal((await handlers.get_operation({ operation: "nonexistent" })).isError, true);
    const { listOperationCommands } = require("../packages/cli/src/operation-commands");
    const tickFilter = listOperationCommands().flatMap(op => op.parameters).find(p => p.name === "tick_filter");
    assert.match(tickFilter.description, /4-character/);
    assert.match(tickFilter.description, /56/);
    const bodyFile = path.join(tempDir, "body.json");
    fs.writeFileSync(bodyFile, '\uFEFF{"filter":{"tick":"ordi"},"limit":2}');
    try {
      for (const command of [direct, semantic]) {
        assert.equal(cli([...command, "--body-file", bodyFile, "--dry-run"]).payload.mode, "plan");
        assert.equal(cli([...command, "--body-file", bodyFile, "--body", "{}", "--dry-run"]).payload.mode, "invalid_body");
        assert.equal(cli([...command, "--body-file", `${bodyFile}.missing`, "--dry-run"]).payload.mode, "invalid_body");
      }
    } finally { fs.unlinkSync(bodyFile); }
    globalThis.fetch = async () => Response.json({ code: -2003, msg: "quota unavailable" }, { status: 403 });
    const quota = await handlers.call_api({ path: "/openapi/public/get_credits", apiKey: "fake", environment: "fractal" });
    assert.equal(quota.isError, true);
    assert.equal(quota.structuredContent.reason, "quota_unavailable");
    assert.equal(quota.structuredContent.retryable, false);
    globalThis.fetch = async () => Response.json({ code: 0 });
    assert.equal((await handlers.call_api({ path: operation.path, apiKey: "fake", body: "{}" })).structuredContent.mode, "confirmation_required");
    assert.equal((await handlers.call_api({ path: operation.path, apiKey: "fake", body: "{}", confirm: true })).isError, false);
    assert.equal((await handlers.call_api({ path: operation.path, apiKey: "fake", confirm: true })).structuredContent.mode, "missing_body");
    const authArgs = ["--api-key", "fake_override_key"];
    for (const [setup, mode] of [
      ["global.fetch = async () => { throw new Error('fake_override_key'); };", "network_error"],
      ["global.fetch = async () => { throw new DOMException('timed out', 'TimeoutError'); };", "timeout"],
      ["global.fetch = async () => new Response('{', {headers: {'content-type':'application/json'}});", "invalid_response"],
      ["global.fetch = async () => Response.json({msg: 'forbidden'}, {status: 403});", "forbidden"],
      ["global.fetch = async () => Response.json({msg: 'rate limited'}, {status: 429, headers: {'retry-after':'5'}});", "rate_limited"],
    ]) {
      result = cli(["getCredits", ...authArgs], setup);
      assert.equal(result.status, 1);
      assert.equal(result.payload.mode, mode);
      if (mode === "rate_limited") assert.equal(result.payload.response.retryAfter, "5");
      if (["timeout", "network_error", "rate_limited"].includes(mode)) assert.equal(result.payload.retryable, true);
      result = cli([...semantic, "--body", "{}", "--confirm", ...authArgs], setup);
      assert.equal(result.payload.retryable, false, "Writes must not be automatically retried");
    }
    globalThis.fetch = async (_url, options) => {
      assert.ok(options.signal instanceof AbortSignal);
      return Response.json({ code: 0 });
    };
    assert.equal((await callApi({ apiPath: "/openapi/public/get_credits", apiKey: "fake" })).mode, "detail");
  } finally {
    globalThis.fetch = originalFetch;
    fs.unlinkSync(envFile);
    fs.rmdirSync(tempDir);
  }
}
