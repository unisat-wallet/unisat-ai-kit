import crypto from "crypto";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = fs.readFileSync(
  path.join(rootDir, "scripts", "fixtures", "openapi.yaml")
);
const fixtureHash = crypto.createHash("sha256").update(fixture).digest("hex");

function runCli(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["packages/cli/bin/unisat-ai.js", ...args], {
      cwd: rootDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || stdout));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/files/openapi.yaml") {
    response.writeHead(200, {
      "content-type": "application/yaml",
      "content-length": fixture.length,
    });
    response.end(fixture);
    return;
  }
  if (pathname === "/manifest.json") {
    const manifest = Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        version: "smoke-v1",
        bundle: {
          path: "swagger.yaml",
          sha256: fixtureHash,
          size: fixture.length,
        },
        files: [
          {
            name: "openapi",
            path: "files/openapi.yaml",
            sha256: fixtureHash,
            size: fixture.length,
          },
        ],
      })
    );
    response.writeHead(200, {
      "content-type": "application/json",
      "content-length": manifest.length,
    });
    response.end(manifest);
    return;
  }
  response.writeHead(404);
  response.end();
});

const cacheDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "unisat-ai-kit-swagger-cache-")
);

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const env = {
    ...process.env,
    OPENAPI_SWAGGER_DIR: "",
    UNISAT_OPENAPI_CACHE_DIR: cacheDir,
    UNISAT_OPENAPI_MANIFEST_URL: `http://127.0.0.1:${address.port}/manifest.json`,
  };

  const show = await runCli(
    ["intro", "show", "--path", "/v1/indexer/brc20/{ticker}/info", "--format", "json"],
    env
  );
  if (show.mode !== "detail") {
    throw new Error("automatic Swagger cache initialization failed");
  }

  const refresh = await runCli(
    ["swagger", "refresh", "--force", "--format", "json"],
    env
  );
  if (!refresh.available || refresh.bundleHash !== fixtureHash) {
    throw new Error("manual Swagger cache refresh failed");
  }

  const status = await runCli(["swagger", "status", "--format", "json"], env);
  if (!status.available || status.version !== "smoke-v1" || status.files !== 1) {
    throw new Error("Swagger cache status failed");
  }

  console.log("swagger cache smoke ok");
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(cacheDir, { recursive: true, force: true });
}
