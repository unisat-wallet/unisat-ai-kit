import fs from "fs";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { buildRequestPlan } from "../packages/cli/src/openapi-request.js";
import { getOpenApiDetail } from "../packages/cli/src/openapi-utils.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const smokeEnvFile = path.join(rootDir, ".smoke.env");

function smokeEnv() {
  return {
    ...process.env,
    UNISAT_AI_ENV_FILE: smokeEnvFile,
  };
}

function runCommand(args) {
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
      if (code !== 0) {
        reject(new Error(`command failed (${args.join(" ")}): ${stderr || stdout}`));
        return;
      }
      resolve({ stdout, stderr });
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
        const resolveResponse = responses.find((item) => item.id === 3);
        const showResponse = responses.find((item) => item.id === 4);
        const statusResponse = responses.find((item) => item.id === 5);
        const environmentsResponse = responses.find((item) => item.id === 6);
        const callApiResponse = responses.find((item) => item.id === 7);
        const postConfirmationResponse = responses.find((item) => item.id === 8);
        if (!initResponse || !listResponse || !resolveResponse || !showResponse || !statusResponse || !environmentsResponse || !callApiResponse || !postConfirmationResponse) {
          return;
        }
        assert(initResponse.result?.protocolVersion === "2025-06-18", "initialize response invalid");
        assert(Array.isArray(listResponse.result?.tools), "tools/list response invalid");
        ["get_status", "list_environments", "resolve_api", "show_api", "call_api"].forEach((toolName) => {
          assert(listResponse.result.tools.some((item) => item.name === toolName), `${toolName} tool missing`);
        });
        assert(resolveResponse.result?.structuredContent?.command === "intro.resolve", "tools/call resolve_api invalid");
        assert(showResponse.result?.structuredContent?.command === "intro.show", "tools/call show_api invalid");
        assert(statusResponse.result?.structuredContent?.command === "mcp.get_status", "tools/call get_status invalid");
        assert(statusResponse.result.structuredContent.tools.includes("call_api"), "get_status tool list invalid");
        assert(environmentsResponse.result?.structuredContent?.command === "mcp.list_environments", "tools/call list_environments invalid");
        assert(environmentsResponse.result.structuredContent.environments.some((item) => item.name === "bitcoin"), "bitcoin environment missing");
        assert(callApiResponse.result?.structuredContent?.command === "api.call", "tools/call call_api invalid");
        assert(callApiResponse.result.structuredContent.mode === "not_found", "call_api should return not_found without network");
        assert(postConfirmationResponse.result?.structuredContent?.command === "api.call", "tools/call post confirmation invalid");
        assert(postConfirmationResponse.result.structuredContent.mode === "confirmation_required", "non-GET call_api should require confirmation");
        assert(postConfirmationResponse.result.isError === true, "confirmation_required should be an MCP error result");
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
          name: "resolve_api",
          arguments: { query: "marketplace brc20 ticker history" },
        },
      });
      sendMessage(child.stdin, {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "show_api",
          arguments: { path: "/v1/indexer/brc20/{ticker}/info" },
        },
      });
      sendMessage(child.stdin, {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "get_status",
          arguments: {},
        },
      });
      sendMessage(child.stdin, {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: {
          name: "list_environments",
          arguments: {},
        },
      });
      sendMessage(child.stdin, {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: {
          name: "call_api",
          arguments: { environment: "bitcoin", path: "/not-found", apiKey: "mcp_smoke" },
        },
      });
      sendMessage(child.stdin, {
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: {
          name: "call_api",
          arguments: { environment: "bitcoin", path: "/v3/market/runes/auction/runes_types", apiKey: "mcp_smoke" },
        },
      });
    }, 100);

  });
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
  validateRequestPlanning();
  console.log("ok request planning");

  const cliChecks = [
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
      name: "cli intro show",
      args: ["packages/cli/bin/unisat-ai.js", "intro", "show", "--path", "/v1/indexer/brc20/{ticker}/info", "--format", "json"],
      validate(stdout) {
        const payload = JSON.parse(stdout);
        assert(payload.command === "intro.show", "intro show payload invalid");
        assert(payload.path === "/v1/indexer/brc20/{ticker}/info", "intro show path invalid");
      },
    },
    {
      name: "cli intro resolve",
      args: ["packages/cli/bin/unisat-ai.js", "intro", "resolve", "--env", "bitcoin", "--query", "marketplace brc20 ticker history", "--format", "json"],
      validate(stdout) {
        const payload = JSON.parse(stdout);
        assert(payload.command === "intro.resolve", "intro resolve payload invalid");
        assert(payload.selected?.path, "intro resolve selected path missing");
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
    const { stdout } = await runCommand(check.args);
    check.validate(stdout);
    console.log(`ok ${check.name}`);
  }

  await runMcpSmoke();
  console.log("ok mcp server");
  fs.rmSync(smokeEnvFile, { force: true });
}

main().catch((error) => {
  fs.rmSync(smokeEnvFile, { force: true });
  console.error(error.message);
  process.exit(1);
});