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

    const cliDocs = await run(cliBin, ["docs", "search", "--query", "api key", "--limit", "1", "--format", "json"], {
      cwd: tempDir,
      env: {
        ...process.env,
        UNISAT_DEV_DOCS_DIR: "",
        OPENAPI_SWAGGER_DIR: "",
      },
    });
    const docsPayload = JSON.parse(cliDocs.stdout);
    assert(docsPayload.command === "docs.search", "packed cli docs search failed");
    assert(Array.isArray(docsPayload.results), "packed cli docs results invalid");

    const cliOpenApi = await run(
      cliBin,
      ["openapi", "explain", "--path", "/v1/indexer/brc20/status", "--format", "json"],
      {
        cwd: tempDir,
        env: {
          ...process.env,
          UNISAT_DEV_DOCS_DIR: "",
          OPENAPI_SWAGGER_DIR: "",
        },
      }
    );
    const openApiPayload = JSON.parse(cliOpenApi.stdout);
    assert(openApiPayload.command === "openapi.explain", "packed cli openapi explain failed");

    const cliError = await run(cliBin, ["error", "explain", "--code", "-154", "--format", "json"], {
      cwd: tempDir,
      env: {
        ...process.env,
        UNISAT_DEV_DOCS_DIR: "",
        OPENAPI_SWAGGER_DIR: "",
      },
    });
    const errorPayload = JSON.parse(cliError.stdout);
    assert(errorPayload.command === "error.explain", "packed cli error explain failed");

    const mcpBoot = await run("node", [mcpBin, "--help"], {
      cwd: tempDir,
      env: {
        ...process.env,
        UNISAT_DEV_DOCS_DIR: "",
        OPENAPI_SWAGGER_DIR: "",
      },
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
