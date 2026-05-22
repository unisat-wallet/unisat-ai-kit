import fs from "fs";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

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
  const body = Buffer.from(JSON.stringify(message), "utf8");
  stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  stdin.write(body);
}

async function runMcpSmoke() {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["packages/mcp-server/bin/server.js"], {
      cwd: rootDir,
      env: smokeEnv(),
      stdio: ["pipe", "pipe", "inherit"],
    });

    let buffer = Buffer.alloc(0);
    let settled = false;
    const responses = [];

    function parseMessages() {
      while (true) {
        const delimiterIndex = buffer.indexOf("\r\n\r\n");
        if (delimiterIndex === -1) {
          return;
        }
        const headerText = buffer.slice(0, delimiterIndex).toString("utf8");
        const lengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
        if (!lengthMatch) {
          finish(new Error("mcp smoke failed: missing Content-Length"));
          return;
        }
        const length = Number.parseInt(lengthMatch[1], 10);
        const bodyStart = delimiterIndex + 4;
        const bodyEnd = bodyStart + length;
        if (buffer.length < bodyEnd) {
          return;
        }
        const body = buffer.slice(bodyStart, bodyEnd).toString("utf8");
        buffer = buffer.slice(bodyEnd);
        responses.push(JSON.parse(body));
        validateResponses();
      }
    }

    function finish(error) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      child.kill();
      if (error) {
        reject(error);
        return;
      }
      resolve();
    }

    function validateResponses() {
      try {
        const initResponse = responses.find((item) => item.id === 1);
        const listResponse = responses.find((item) => item.id === 2);
        const callResponse = responses.find((item) => item.id === 3);
        if (!initResponse || !listResponse || !callResponse) {
          return;
        }
        assert(initResponse.result?.protocolVersion === "2025-06-18", "initialize response invalid");
        assert(Array.isArray(listResponse.result?.tools), "tools/list response invalid");
        assert(listResponse.result.tools.some((item) => item.name === "resolve_api"), "resolve_api tool missing");
        assert(callResponse.result?.structuredContent?.command === "intro.resolve", "tools/call resolve_api invalid");
        finish();
      } catch (error) {
        finish(error);
      }
    }

    const timeout = setTimeout(() => {
      finish(new Error("tools/call resolve_api invalid or timed out"));
    }, 10000);
    child.stdout.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
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
    }, 100);

  });
}

async function main() {
  fs.rmSync(smokeEnvFile, { force: true });

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
        assert(payload.selected?.path === "/v3/market/brc20/auction/brc20_kline", "marketplace brc20 ticker history should resolve to brc20 kline");
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