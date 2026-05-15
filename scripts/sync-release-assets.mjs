import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliDir = path.join(rootDir, "packages", "cli");
const vendorDir = path.join(cliDir, "vendor");
const bundledDevDocsDir = path.join(vendorDir, "unisat-dev-docs");
const bundledSwaggerDir = path.join(vendorDir, "openapi-swagger");

const sourceDevDocsDir = process.env.UNISAT_DEV_DOCS_DIR || path.resolve(rootDir, "..", "unisat-dev-docs");
const sourceSwaggerDir = process.env.OPENAPI_SWAGGER_DIR || path.join(rootDir, "swagger");

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

function main() {
  if (!fs.existsSync(sourceDevDocsDir)) {
    throw new Error(`missing UNISAT_DEV_DOCS_DIR source: ${sourceDevDocsDir}`);
  }

  if (!fs.existsSync(sourceSwaggerDir)) {
    throw new Error(`missing OPENAPI_SWAGGER_DIR source: ${sourceSwaggerDir}`);
  }

  resetDir(vendorDir);

  const sourceOpenApiDir = path.join(sourceDevDocsDir, "open-api");
  const targetOpenApiDir = path.join(bundledDevDocsDir, "open-api");
  copyTree(sourceOpenApiDir, targetOpenApiDir, (filePath) => filePath.endsWith(".md"));

  const sourceErrorsFile = path.join(
    sourceDevDocsDir,
    "errors",
    "auto-generated",
    "open-api-errors.json"
  );
  const targetErrorsFile = path.join(
    bundledDevDocsDir,
    "errors",
    "auto-generated",
    "open-api-errors.json"
  );
  ensureDir(path.dirname(targetErrorsFile));
  fs.copyFileSync(sourceErrorsFile, targetErrorsFile);

  const sourceSwaggerFilesDir = sourceSwaggerDir;
  const targetSwaggerFilesDir = bundledSwaggerDir;
  copyTree(sourceSwaggerFilesDir, targetSwaggerFilesDir, (filePath) => filePath.endsWith(".yaml"));

}

main();
