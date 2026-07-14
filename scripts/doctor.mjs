import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const requiredPaths = [
  "package.json",
  "swagger",
  "packages/cli/package.json",
  "packages/cli/bin/unisat-ai.js",
  "packages/cli/src",
  "packages/mcp-server/package.json",
  "packages/mcp-server/bin/server.js",
  "packages/mcp-server/src/tools.js",
];

const missing = requiredPaths.filter((item) => !fs.existsSync(path.join(rootDir, item)));

if (missing.length > 0) {
  console.error("doctor failed");
  missing.forEach((item) => console.error(`missing: ${item}`));
  process.exit(1);
}

console.log("doctor ok");
requiredPaths.forEach((item) => console.log(`- ${item}`));
