import fs from "fs";
import { spawn } from "child_process";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { buildRequestPlan } from "../packages/cli/src/openapi-request.js";
import { getOpenApiDetail } from "../packages/cli/src/openapi-utils.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { buildPlanPayload } = require("../packages/cli/src/operation-runner.js");
const smokeEnvFile = path.join(rootDir, ".smoke.env");

function smokeEnv() {
  return {
    ...process.env,
    UNISAT_AI_KIT_ENV_FILE: smokeEnvFile,
  };
}

function runCommand(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", args, {
      cwd: rootDir,
      env: smokeEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("close", (code) => {
      if (options.expectFailure) {
        if (code === 0) {
          reject(new Error(`command unexpectedly succeeded (${args.join(" ")}): ${stdout}`));
          return;
        }
        resolve({ stdout, stderr, code });
        return;
      }
      if (code !== 0) {
        reject(new Error(`command failed (${args.join(" ")}): ${stderr || stdout}`));
        return;
      }
      resolve({ stdout, stderr, code });
    });
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sendMessage(stdin, message) {
  stdin.write(`${JSON.stringify(message)}\n`);
}

async function runMcpSmoke() {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["packages/mcp-server/bin/server.js"], {
      cwd: rootDir,
      env: smokeEnv(),
      stdio: ["pipe", "pipe", "inherit"],
    });

    let buffer = "";
    let settled = false;
    const responses = [];

    function parseMessages() {
      while (true) {
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex === -1) {
          return;
        }
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
        buffer = buffer.slice(newlineIndex + 1);
        if (!line.trim()) {
          continue;
        }
        responses.push(JSON.parse(line));
        validateResponses();
      }
    }

    function finish(error) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      const complete = () => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      };
      child.once("close", complete);
      if (!child.kill()) {
        complete();
      }
    }

    function validateResponses() {
      try {
        const initResponse = responses.find((item) => item.id === 1);
        const listResponse = responses.find((item) => item.id === 2);
        const statusResponse = responses.find((item) => item.id === 3);
        const callResponse = responses.find((item) => item.id === 4);
        if (!initResponse || !listResponse || !statusResponse || !callResponse) {
          return;
        }
        assert(initResponse.result?.protocolVersion === "2025-06-18", "initialize response invalid");
        assert(Array.isArray(listResponse.result?.tools), "tools/list response invalid");
        assert(listResponse.result.tools.length === 2, "MCP should expose get_status and call_api");
        assert(listResponse.result.tools.some((tool) => tool.name === "get_status"), "get_status tool missing");
        assert(listResponse.result.tools.some((tool) => tool.name === "call_api"), "call_api tool missing");
        assert(statusResponse.result?.structuredContent?.command === "mcp.get_status", "tools/call get_status invalid");
        assert(statusResponse.result.structuredContent.tools.length === 2, "get_status tool list invalid");
        assert(statusResponse.result.structuredContent.tools.includes("get_status"), "get_status tool name invalid");
        assert(statusResponse.result.structuredContent.tools.includes("call_api"), "call_api tool name invalid");
        assert(callResponse.result?.structuredContent?.command === "api.call", "tools/call call_api invalid");
        assert(callResponse.result.structuredContent.mode === "not_found", "call_api should call exact path and return not_found");
        finish();
      } catch (error) {
        finish(error);
      }
    }

    const timeout = setTimeout(() => {
      finish(new Error("mcp smoke invalid or timed out"));
    }, 10000);
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      parseMessages();
    });
    child.on("error", finish);

    sendMessage(child.stdin, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "smoke", version: "0.1.0" },
      },
    });

    setTimeout(() => {
      sendMessage(child.stdin, { jsonrpc: "2.0", method: "notifications/initialized", params: {} });
      sendMessage(child.stdin, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      sendMessage(child.stdin, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "get_status",
          arguments: {},
        },
      });
      sendMessage(child.stdin, {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "call_api",
          arguments: {
            path: "/not-found",
            environment: "bitcoin",
          },
        },
      });
    }, 100);
  });
}

function validateMcpToolModuleImport() {
  const tools = require("../packages/mcp-server/src/tools.js");
  assert(typeof tools.registerTools === "function", "mcp tools module should load and export registerTools");
}

function makeSyntheticPostOperation() {
  return {
    commandName: "postSyntheticSmoke",
    operationId: "postSyntheticSmoke",
    method: "post",
    path: "/v1/indexer/local_pushtx",
    file: "blockchain-indexer.yaml",
    tags: ["Smoke"],
    summary: "Synthetic POST smoke operation",
    description: "Synthetic POST smoke operation",
    parameters: [],
    requestBody: {
      required: true,
      contentTypes: ["application/json"],
    },
    readOnly: false,
    requiresConfirmation: true,
  };
}

function validateSemanticPostBodyPlanning() {
  const missingBody = buildPlanPayload(makeSyntheticPostOperation(), { "dry-run": "true" });
  assert(missingBody.mode === "missing_required_params", "POST operation should require --body when requestBody is required");
  assert(missingBody.missing.body === true, "POST missing body should be reported");
  assert(missingBody.nextAction.includes("--body"), "POST missing body next action should mention --body");
  assert(missingBody.example.includes("--body"), "POST example should include --body");

  const withBody = buildPlanPayload(makeSyntheticPostOperation(), { body: "{\"tx\":\"00\"}", "dry-run": "true" });
  assert(withBody.mode === "plan", "POST operation with --body should be plannable");
  assert(withBody.request.body === "{\"tx\":\"00\"}", "POST plan should preserve raw JSON body string");
  assert(withBody.safety.requiresConfirmation === true, "POST plan should require confirmation");
}

function validateRequestPlanning() {
  const swapBalanceDetail = getOpenApiDetail("/v1/brc20-swap/balance");
  assert(swapBalanceDetail.parameters.some((item) => item.name === "address" && item.in === "query"), "schema-first query parameter address missing");
  assert(swapBalanceDetail.parameters.some((item) => item.name === "tick" && item.in === "query"), "schema-first query parameter tick missing");

  const swapBalancePlan = buildRequestPlan("/v1/brc20-swap/balance", {
    environment: "bitcoin",
    queryParams: {
      ADDRESS: "bc1 smoke/value",
      tick: "ordi",
      custom: "extra value",
    },
    includeOptionalQuery: false,
  });
  assert(swapBalancePlan.queryString.includes("address=bc1+smoke%2Fvalue"), "query parameter should match case-insensitively and be encoded");
  assert(swapBalancePlan.queryString.includes("tick=ordi"), "schema-first query parameter tick should be included");
  assert(swapBalancePlan.queryString.includes("custom=extra+value"), "extra query parameter should be preserved");

  const pathPlan = buildRequestPlan("/v1/indexer/address/{address}/balance", {
    environment: "bitcoin",
    pathParams: {
      ADDRESS: "bc1 smoke/value",
    },
    includeOptionalQuery: false,
    requirePathParams: true,
  });
  assert(pathPlan.resolvedPath === "/v1/indexer/address/bc1%20smoke%2Fvalue/balance", "path parameter should match case-insensitively and be encoded");
}

async function main() {
  fs.rmSync(smokeEnvFile, { force: true });
  validateMcpToolModuleImport();
  console.log("ok mcp tools import");
  validateRequestPlanning();
  console.log("ok request planning");
  validateSemanticPostBodyPlanning();
  console.log("ok semantic POST body planning");

  const cliChecks = [
    {
      name: "cli lists all semantic commands",
      args: ["packages/cli/bin/unisat-ai.js", "commands", "--all", "--format", "json"],
      validate(stdout) {
        const payload = JSON.parse(stdout);
        assert(payload.command === "commands", "commands payload invalid");
        assert(payload.total > 16, "all swagger semantic commands should be enabled");
        assert(payload.items.some((item) => item.file === "alkanes-indexer.yaml" && item.commandName === "getAlkanesInfoList"), "alkanes-indexer command missing");
        assert(payload.items.some((item) => item.file === "blockchain-indexer.yaml" && item.commandName === "getRecommendedFees"), "blockchain-indexer command missing");
        assert(payload.items.some((item) => item.file === "inscribe.yaml" && item.commandName === "createOrder" && item.requestBody.required === true), "POST body metadata missing");
      },
    },
    {
      name: "cli lists BRC20 semantic commands",
      args: ["packages/cli/bin/unisat-ai.js", "commands", "--domain", "brc20", "--format", "json"],
      validate(stdout) {
        const payload = JSON.parse(stdout);
        assert(payload.command === "commands", "commands payload invalid");
        assert(payload.total === 16, "BRC20 command count invalid");
        assert(payload.items.some((item) => item.commandName === "getBrc20Status"), "getBrc20Status command missing");
        assert(payload.items.some((item) => item.commandName === "getBrc20InfoByTicker"), "getBrc20InfoByTicker command missing");
        const historyByTx = payload.items.find((item) => item.commandName === "getBrc20HistoryByTickerAndTxid");
        const typeParam = historyByTx?.parameters.find((parameter) => parameter.name === "type");
        assert(typeParam?.enum?.includes("inscribe-deploy"), "BRC20 history type enum missing");
        assert(typeParam.enum.includes("receive"), "BRC20 history type enum incomplete");
        const status = payload.items.find((item) => item.commandName === "getBrc20Status");
        const sortParam = status?.parameters.find((parameter) => parameter.name === "sort");
        assert(sortParam?.enum?.includes("holders"), "BRC20 status sort enum missing");
        assert(sortParam?.example === "deploy", "BRC20 status sort example missing");
      },
    },
    {
      name: "cli semantic command dry run",
      args: ["packages/cli/bin/unisat-ai.js", "getBrc20Status", "--start", "1", "--limit", "10", "--dry-run", "--format", "json"],
      validate(stdout) {
        const payload = JSON.parse(stdout);
        assert(payload.command === "getBrc20Status", "semantic command payload invalid");
        assert(payload.mode === "plan", "semantic command dry-run should plan");
        assert(payload.request.url.includes("/v1/indexer/brc20/status?"), "semantic command plan URL invalid");
        assert(payload.request.queryString.includes("start=1"), "semantic command start query missing");
        assert(payload.request.queryString.includes("limit=10"), "semantic command limit query missing");
      },
    },
    {
      name: "cli semantic command detects missing params",
      args: ["packages/cli/bin/unisat-ai.js", "getBrc20InfoByTicker", "--dry-run", "--format", "json"],
      expectFailure: true,
      validate(stdout) {
        const payload = JSON.parse(stdout);
        assert(payload.command === "getBrc20InfoByTicker", "missing param command payload invalid");
        assert(payload.mode === "missing_required_params", "missing semantic params should be reported");
        assert(payload.missing.pathParams.includes("ticker"), "missing ticker should be reported");
      },
    },
    {
      name: "cli config bitcoin key",
      args: ["packages/cli/bin/unisat-ai.js", "config", "bitcoin-key", "--api-key", "btc_smoke", "--format", "json"],
      validate(stdout) {
        const payload = JSON.parse(stdout);
        assert(payload.command === "config.bitcoin-key", "config bitcoin-key payload invalid");
        assert(payload.keyEnv === "UNISAT_BITCOIN_API_KEY", "config bitcoin-key env invalid");
      },
    },
    {
      name: "cli config fractal key",
      args: ["packages/cli/bin/unisat-ai.js", "config", "fractal-key", "--api-key", "fractal_smoke", "--format", "json"],
      validate(stdout) {
        const payload = JSON.parse(stdout);
        assert(payload.command === "config.fractal-key", "config fractal-key payload invalid");
        assert(payload.keyEnv === "UNISAT_FRACTAL_API_KEY", "config fractal-key env invalid");
      },
    },
    {
      name: "cli api call uses dotenv key",
      args: ["packages/cli/bin/unisat-ai.js", "api", "call", "--env", "bitcoin", "--path", "/not-found", "--format", "json"],
      validate(stdout) {
        const payload = JSON.parse(stdout);
        assert(payload.command === "api.call", "api call payload invalid");
        assert(payload.mode === "not_found", "api call should read .env key and return not_found without network");
      },
    },
  ];

  for (const check of cliChecks) {
    const { stdout } = await runCommand(check.args, { expectFailure: check.expectFailure });
    check.validate(stdout);
    console.log(`ok ${check.name}`);
  }

  const introCommand = await runCommand(["packages/cli/bin/unisat-ai.js", "intro", "resolve", "--env", "bitcoin", "--query", "address balance", "--format", "json"], { expectFailure: true });
  const introPayload = JSON.parse(introCommand.stdout);
  assert(introPayload.mode === "unknown_command" && introPayload.command === "intro", "intro command should be rejected as an unknown command");
  console.log("ok cli rejects intro commands");

  await runMcpSmoke();
  console.log("ok mcp server");
  fs.rmSync(smokeEnvFile, { force: true });
}

main().catch((error) => {
  fs.rmSync(smokeEnvFile, { force: true });
  console.error(error.message);
  process.exit(1);
});
