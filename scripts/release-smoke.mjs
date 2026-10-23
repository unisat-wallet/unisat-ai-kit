import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { buildRequestPlan } from "../packages/cli/src/openapi-request.js";
import { getOpenApiDetail } from "../packages/cli/src/openapi-utils.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const smokeSwaggerDir = path.join(rootDir, "scripts", "fixtures");
process.env.OPENAPI_SWAGGER_DIR = smokeSwaggerDir;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || rootDir,
      env: options.env || process.env,
      stdio: options.stdio || ["ignore", "pipe", "pipe"],
      shell: options.shell ?? (process.platform === "win32" && command.endsWith(".cmd")),
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      reject(new Error(`${command} ${args.join(" ")} failed to start: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} failed: ${stderr || stdout}`));
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

async function runMcpSmoke(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || rootDir,
      env: options.env || process.env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: options.shell ?? (process.platform === "win32" && command.endsWith(".cmd")),
    });

    let buffer = "";
    let stderr = "";
    let settled = false;
    const responses = [];

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
        assert(initResponse.result?.protocolVersion, "packed mcp initialize response invalid");
        assert(listResponse.result?.tools?.length === 2, "packed mcp should expose get_status and call_api");
        assert(listResponse.result.tools.some((tool) => tool.name === "get_status"), "packed mcp get_status missing");
        assert(listResponse.result.tools.some((tool) => tool.name === "call_api"), "packed mcp call_api missing");
        assert(statusResponse.result?.structuredContent?.command === "mcp.get_status", "packed mcp get_status invalid");
        assert(callResponse.result?.structuredContent?.command === "api.call", "packed mcp call_api invalid");
        assert(callResponse.result.structuredContent.mode === "not_found", "packed mcp call_api should return not_found");
        finish();
      } catch (error) {
        finish(error);
      }
    }

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

    const timeout = setTimeout(() => {
      finish(new Error(`packed mcp smoke timed out${stderr ? `: ${stderr}` : ""}`));
    }, 30000);

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      parseMessages();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", finish);

    sendMessage(child.stdin, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "release-smoke", version: "0.1.0" },
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

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function packageBin(binDir, commandName) {
  return path.join(binDir, process.platform === "win32" ? `${commandName}.cmd` : commandName);
}

async function packPackage(packageDir) {
  const { stdout } = await run(npmCommand(), ["pack", "--json"], { cwd: packageDir });
  const [packResult] = JSON.parse(stdout);
  return {
    tarball: path.join(packageDir, packResult.filename),
    files: packResult.files.map((file) => file.path),
  };
}

function assertPackedFile(files, expectedPath) {
  assert(files.includes(expectedPath), `packed file missing: ${expectedPath}`);
}

function validateRequestPlanning() {
  const swapBalanceDetail = getOpenApiDetail("/v1/brc20-swap/balance");
  assert(swapBalanceDetail.parameters.some((item) => item.name === "address" && item.in === "query"), "release schema-first query parameter address missing");
  assert(swapBalanceDetail.parameters.some((item) => item.name === "tick" && item.in === "query"), "release schema-first query parameter tick missing");

  const swapBalancePlan = buildRequestPlan("/v1/brc20-swap/balance", {
    environment: "bitcoin",
    queryParams: {
      ADDRESS: "bc1 smoke/value",
      tick: "ordi",
      custom: "extra value",
    },
    includeOptionalQuery: false,
  });
  assert(swapBalancePlan.queryString.includes("address=bc1+smoke%2Fvalue"), "release query parameter should match case-insensitively and be encoded");
  assert(swapBalancePlan.queryString.includes("tick=ordi"), "release schema-first query parameter tick should be included");
  assert(swapBalancePlan.queryString.includes("custom=extra+value"), "release extra query parameter should be preserved");
}

async function main() {
  validateRequestPlanning();
  const cliPackageDir = path.join(rootDir, "packages", "cli");
  const mcpPackageDir = path.join(rootDir, "packages", "mcp-server");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "unisat-ai-kit-release-smoke-"));

  let cliTarball = "";
  let mcpTarball = "";

  try {
    const cliPack = await packPackage(cliPackageDir);
    const mcpPack = await packPackage(mcpPackageDir);
    cliTarball = cliPack.tarball;
    mcpTarball = mcpPack.tarball;

    assert(!cliPack.files.some((file) => file.startsWith("vendor/openapi-swagger/")), "packed cli must not contain swagger snapshots");
    assertPackedFile(mcpPack.files, "bin/server.js");
    assertPackedFile(mcpPack.files, "src/tools.js");

    await run(npmCommand(), ["init", "-y"], { cwd: tempDir });
    await run(npmCommand(), ["install", cliTarball, mcpTarball], { cwd: tempDir });

    const binDir = path.join(tempDir, "node_modules", ".bin");
    const cliBin = packageBin(binDir, "unisat-openapi-cli");
    const mcpBin = packageBin(binDir, "unisat-openapi-mcp");
    const env = {
      ...process.env,
      OPENAPI_SWAGGER_DIR: smokeSwaggerDir,
      UNISAT_BITCOIN_API_KEY: "release_smoke",
    };

    const allCommandList = await run(cliBin, ["commands", "--all", "--format", "json"], {
      cwd: tempDir,
      env,
    });
    const allCommandListPayload = JSON.parse(allCommandList.stdout);
    assert(allCommandListPayload.command === "commands", "packed cli all commands failed");
    assert(allCommandListPayload.total === 6, "packed cli should load all fixture commands");
    assert(allCommandListPayload.items.some((item) => item.file === "openapi.yaml" && item.commandName === "getV1IndexerAddressAddressBalance"), "packed cli address balance command missing");
    assert(allCommandListPayload.items.some((item) => item.file === "openapi.yaml" && item.commandName === "postV3MarketRunesAuctionRunesTypes"), "packed cli POST command missing");

    const commandList = await run(cliBin, ["commands", "--tag", "Indexer-BRC20", "--format", "json"], {
      cwd: tempDir,
      env,
    });
    const commandListPayload = JSON.parse(commandList.stdout);
    assert(commandListPayload.command === "commands", "packed cli commands failed");
    assert(commandListPayload.total === 3, "packed cli tag filter count invalid");
    assert(commandListPayload.items.some((item) => item.commandName === "getV1IndexerBrc20TickerInfo"), "packed cli BRC20 info command missing");

    const dryRun = await run(cliBin, ["getV1Brc20SwapBalance", "--address", "bc1-smoke", "--tick", "ordi", "--dry-run", "--format", "json"], {
      cwd: tempDir,
      env,
    });
    const dryRunPayload = JSON.parse(dryRun.stdout);
    assert(dryRunPayload.command === "getV1Brc20SwapBalance", "packed cli semantic command failed");
    assert(dryRunPayload.mode === "plan", "packed cli semantic command should dry-run");
    assert(dryRunPayload.request.queryString.includes("address=bc1-smoke"), "packed cli semantic command address query missing");
    assert(dryRunPayload.request.queryString.includes("tick=ordi"), "packed cli semantic command tick query missing");

    const cliCall = await run(cliBin, ["api", "call", "--env", "bitcoin", "--path", "/not-found", "--format", "json"], {
      cwd: tempDir,
      env,
    });
    const callPayload = JSON.parse(cliCall.stdout);
    assert(callPayload.command === "api.call", "packed cli api call failed");
    assert(callPayload.mode === "not_found", "packed cli api call should return not_found without network");

    await runMcpSmoke(mcpBin, [], {
      cwd: tempDir,
      env,
    });

    console.log("release smoke ok");
  } finally {
    if (cliTarball) {
      fs.rmSync(cliTarball, { force: true });
    }

    if (mcpTarball) {
      fs.rmSync(mcpTarball, { force: true });
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
