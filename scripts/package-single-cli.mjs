import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist", "single-cli");
const buildDir = path.join(distDir, "build");
const swaggerDir = process.env.OPENAPI_SWAGGER_DIR || path.join(rootDir, "swagger");

const targetNames = {
  win32: "windows",
  darwin: "macos",
  linux: "linux",
};

function parseArgs(argv) {
  const options = { target: detectTarget() };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target") {
      options.target = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--help") {
      options.help = true;
    }
  }
  return options;
}

function detectTarget() {
  const platformName = targetNames[process.platform] || process.platform;
  const arch = os.arch() === "arm64" ? "arm64" : "x64";
  return `${platformName}-${arch}`;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || rootDir,
      stdio: options.stdio || "inherit",
      shell: options.shell || false,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
        return;
      }
      resolve();
    });
  });
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function walkFiles(dir, predicate, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, results);
      continue;
    }
    if (predicate(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

function writeSwaggerAsset() {
  const files = {};
  walkFiles(swaggerDir, (filePath) => filePath.endsWith(".yaml"))
    .sort()
    .forEach((filePath) => {
      const relativePath = path.relative(swaggerDir, filePath).replace(/\\/g, "/");
      files[relativePath] = fs.readFileSync(filePath, "utf8");
    });

  const assetPath = path.join(buildDir, "openapi-swagger.json");
  fs.writeFileSync(assetPath, JSON.stringify(files), "utf8");
  return assetPath;
}

function writeAppSource() {
  const sourceRoot = path.join(rootDir, "packages", "cli");
  const entryPath = path.join(sourceRoot, "bin", "unisat-ai.js");
  const modules = collectLocalModules(entryPath, sourceRoot);
  const bundlePath = path.join(buildDir, "main.js");
  const moduleEntries = [...modules.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, source]) => `${JSON.stringify(id)}: function(require, module, exports) {\n${source}\n}`)
    .join(",\n");

  fs.writeFileSync(
    bundlePath,
    `const __modules = {\n${moduleEntries}\n};\nconst __cache = {};\nfunction __localRequire(id) {\n  if (__cache[id]) return __cache[id].exports;\n  if (!__modules[id]) return require(id);\n  const module = { exports: {} };\n  __cache[id] = module;\n  __modules[id](__localRequire, module, module.exports);\n  return module.exports;\n}\n__localRequire(${JSON.stringify(toModuleId(entryPath, sourceRoot))});\n`,
    "utf8"
  );
  return bundlePath;
}

function toModuleId(filePath, sourceRoot) {
  return `./${path.relative(sourceRoot, filePath).replace(/\\/g, "/")}`;
}

function resolveLocalRequire(fromPath, request) {
  if (!request.startsWith(".")) {
    return null;
  }
  const basePath = path.resolve(path.dirname(fromPath), request);
  const candidates = [basePath, `${basePath}.js`, path.join(basePath, "index.js")];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function collectLocalModules(entryPath, sourceRoot, modules = new Map()) {
  const id = toModuleId(entryPath, sourceRoot);
  if (modules.has(id)) {
    return modules;
  }

  let source = fs.readFileSync(entryPath, "utf8").replace(/^#!.*\r?\n/, "");
  source = source.replace(/require\((['"])(\.\.?\/[^'"]+)\1\)/g, (match, quote, request) => {
    const resolved = resolveLocalRequire(entryPath, request);
    if (!resolved) {
      return match;
    }
    collectLocalModules(resolved, sourceRoot, modules);
    return `require(${JSON.stringify(toModuleId(resolved, sourceRoot))})`;
  });
  modules.set(id, source);
  return modules;
}

function writeSeaConfig(mainPath, assetPath) {
  const seaConfigPath = path.join(buildDir, "sea-config.json");
  fs.writeFileSync(
    seaConfigPath,
    JSON.stringify(
      {
        main: mainPath,
        output: path.join(buildDir, "sea-prep.blob"),
        disableExperimentalSEAWarning: true,
        assets: {
          "openapi-swagger.json": assetPath,
        },
      },
      null,
      2
    ),
    "utf8"
  );
  return seaConfigPath;
}

async function removeSignatureIfNeeded(executablePath) {
  if (process.platform !== "darwin") {
    return;
  }
  await run("codesign", ["--remove-signature", executablePath]).catch(() => null);
}

async function injectSeaBlob(executablePath, blobPath) {
  const sentinel = "NODE_SEA_BLOB";
  const args = [
    "postject",
    executablePath,
    sentinel,
    blobPath,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ];
  if (process.platform === "darwin") {
    args.push("--macho-segment-name", "NODE_SEA");
  }
  await run(process.platform === "win32" ? "npx.cmd" : "npx", ["--yes", ...args], {
    shell: process.platform === "win32",
  });
}

async function signIfNeeded(executablePath) {
  if (process.platform !== "darwin") {
    return;
  }
  await run("codesign", ["--sign", "-", executablePath]);
}

function executableName(target) {
  return target.startsWith("windows-") ? "unisat-cli.exe" : "unisat-cli";
}

function archiveName(target) {
  return target.startsWith("windows-") ? `unisat-cli-${target}.zip` : `unisat-cli-${target}.tar.gz`;
}

async function archiveOutput(target, executablePath) {
  const packageDir = path.join(distDir, `unisat-cli-${target}`);
  fs.rmSync(packageDir, { recursive: true, force: true });
  ensureDir(packageDir);
  fs.copyFileSync(executablePath, path.join(packageDir, executableName(target)));
  if (!target.startsWith("windows-")) {
    fs.chmodSync(path.join(packageDir, executableName(target)), 0o755);
  }

  const outputPath = path.join(distDir, archiveName(target));
  fs.rmSync(outputPath, { force: true });
  if (target.startsWith("windows-")) {
    await run("powershell.exe", ["-NoProfile", "-Command", `Compress-Archive -LiteralPath '${packageDir}' -DestinationPath '${outputPath}' -Force`]);
  } else {
    await run("tar", ["-czf", outputPath, "-C", distDir, path.basename(packageDir)]);
  }
  return outputPath;
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function build(options) {
  if (options.target !== detectTarget()) {
    throw new Error(`single executable builds are host-native. Current host is ${detectTarget()}, requested ${options.target}. Use the release workflow matrix for all platforms.`);
  }

  fs.rmSync(buildDir, { recursive: true, force: true });
  ensureDir(buildDir);
  ensureDir(distDir);
  fs.rmSync(path.join(distDir, archiveName(options.target)), { force: true });
  fs.rmSync(path.join(distDir, `unisat-ai-${options.target}.zip`), { force: true });
  fs.rmSync(path.join(distDir, `unisat-ai-${options.target}.tar.gz`), { force: true });

  const assetPath = writeSwaggerAsset();
  const mainPath = writeAppSource();
  const seaConfigPath = writeSeaConfig(mainPath, assetPath);
  await run(process.execPath, ["--experimental-sea-config", seaConfigPath]);

  const exePath = path.join(buildDir, executableName(options.target));
  fs.copyFileSync(process.execPath, exePath);
  await removeSignatureIfNeeded(exePath);
  await injectSeaBlob(exePath, path.join(buildDir, "sea-prep.blob"));
  await signIfNeeded(exePath);

  const outputPath = await archiveOutput(options.target, exePath);
  const checksumPath = path.join(distDir, "checksums.txt");
  fs.writeFileSync(checksumPath, `${sha256(outputPath)}  ${path.basename(outputPath)}\n`, "utf8");
  console.log(`${path.relative(rootDir, outputPath)} ${sha256(outputPath)}`);
  console.log(`wrote ${path.relative(rootDir, checksumPath)}`);
}

function printHelp() {
  console.log("usage: npm run package:cli [-- --target windows-x64|linux-x64|linux-arm64|macos-x64|macos-arm64]");
  console.log("");
  console.log("Builds a host-native single executable archive using Node.js SEA.");
  console.log("Run on each target OS/CPU, or use the GitHub Actions release matrix.");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  await build(options);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
