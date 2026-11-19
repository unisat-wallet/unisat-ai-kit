import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliDir = path.join(rootDir, "packages", "cli");
const vendorDir = path.join(cliDir, "vendor");
const bundledDevDocsDir = path.join(vendorDir, "unisat-dev-docs");

const sourceDevDocsDir = process.env.UNISAT_DEV_DOCS_DIR || "";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resetDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  ensureDir(dirPath);
}

function copyTree(sourceDir, targetDir, predicate) {
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  entries.forEach((entry) => {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyTree(sourcePath, targetPath, predicate);
      return;
    }

    if (!predicate(sourcePath)) {
      return;
    }

    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(sourcePath, targetPath);
  });
}

function copyDevDocsIfAvailable() {
  if (!sourceDevDocsDir || !fs.existsSync(sourceDevDocsDir)) {
    return;
  }

  const sourceOpenApiDir = path.join(sourceDevDocsDir, "open-api");
  if (fs.existsSync(sourceOpenApiDir)) {
    copyTree(sourceOpenApiDir, path.join(bundledDevDocsDir, "open-api"), (filePath) => filePath.endsWith(".md"));
  }

  const sourceErrorsFile = path.join(sourceDevDocsDir, "errors", "auto-generated", "open-api-errors.json");
  if (fs.existsSync(sourceErrorsFile)) {
    const targetErrorsFile = path.join(bundledDevDocsDir, "errors", "auto-generated", "open-api-errors.json");
    ensureDir(path.dirname(targetErrorsFile));
    fs.copyFileSync(sourceErrorsFile, targetErrorsFile);
  }
}

function main() {
  resetDir(vendorDir);
  copyDevDocsIfAvailable();
}

main();
