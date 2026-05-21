import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || rootDir,
      env: options.env || process.env,
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

async function packPackage(packageDir) {
  const { stdout } = await run("npm", ["pack", "--json"], { cwd: packageDir });
  const [{ filename }] = JSON.parse(stdout);
  return path.join(packageDir, filename);
}

async function main() {
  const cliPackageDir = path.join(rootDir, "packages", "cli");
  const mcpPackageDir = path.join(rootDir, "packages", "mcp-server");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "unisat-ai-release-smoke-"));

  let cliTarball = "";
  let mcpTarball = "";

  try {
    cliTarball = await packPackage(cliPackageDir);
    mcpTarball = await packPackage(mcpPackageDir);

    await run("npm", ["init", "-y"], { cwd: tempDir });
    await run("npm", ["install", cliTarball, mcpTarball], { cwd: tempDir });

    const binDir = path.join(tempDir, "node_modules", ".bin");
    const cliBin = path.join(binDir, "unisat-ai-cli");
    const mcpBin = path.join(binDir, "unisat-ai-mcp-server");
    const env = {
      ...process.env,
      UNISAT_DEV_DOCS_DIR: "",
      OPENAPI_SWAGGER_DIR: "",
    };

    const cliShow = await run(cliBin, ["intro", "show", "--path", "/v1/indexer/brc20/{ticker}/info", "--format", "json"], {
      cwd: tempDir,
      env,
    });
    const showPayload = JSON.parse(cliShow.stdout);
    assert(showPayload.command === "intro.show", "packed cli intro show failed");

    const cliResolve = await run(cliBin, ["intro", "resolve", "--env", "bitcoin", "--query", "marketplace brc20 ticker history", "--format", "json"], {
      cwd: tempDir,
      env,
    });
    const resolvePayload = JSON.parse(cliResolve.stdout);
    assert(resolvePayload.command === "intro.resolve", "packed cli intro resolve failed");
    assert(resolvePayload.selected?.path === "/v3/market/brc20/auction/brc20_kline", "packed cli resolve path invalid");

    const mcpBoot = await run("node", [mcpBin, "--help"], {
      cwd: tempDir,
      env,
    }).catch(() => null);

    if (mcpBoot === null) {
      throw new Error("packed mcp package failed to start");
    }

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