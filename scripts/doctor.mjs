import fs from "fs";
import path from "path";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const requiredPaths = [
  "README.md",
  "docs/architecture.md",
  "docs/roadmap-90d.md",
  "packages/cli/package.json",
  "packages/cli/bin/unisat-ai.js",
  "packages/mcp-server/package.json",
  "packages/mcp-server/bin/server.js",
  "packages/shared-types/package.json",
];

const missing = requiredPaths.filter((item) => {
  return !fs.existsSync(path.join(rootDir, item));
});

if (missing.length > 0) {
  console.error("doctor failed");
  missing.forEach((item) => console.error(`missing: ${item}`));
  process.exit(1);
}

console.log("doctor ok");
requiredPaths.forEach((item) => console.log(`- ${item}`));
