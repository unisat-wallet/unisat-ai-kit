import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist", "portable-cli");
const cacheDir = path.join(rootDir, ".cache", "node-runtime");
const nodeVersion = process.env.UNISAT_AI_NODE_VERSION || process.versions.node;

const targets = {
  "windows-x64": {
    nodePlatform: "win-x64",
    nodeExecutable: "node.exe",
    archiveExt: ".zip",
    commandName: "unisat-ai.cmd",
    launcher: "@echo off\r\n%~dp0\\node\\node.exe %~dp0\\packages\\cli\\bin\\unisat-ai.js %*\r\n",
  },
  "linux-x64": {
    nodePlatform: "linux-x64",
    nodeExecutable: "bin/node",
    archiveExt: ".tar.gz",
    commandName: "unisat-ai",
    launcher: "#!/usr/bin/env sh\nDIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)\nexec \"$DIR/node/bin/node\" \"$DIR/packages/cli/bin/unisat-ai.js\" \"$@\"\n",
  },
  "linux-arm64": {
    nodePlatform: "linux-arm64",
    nodeExecutable: "bin/node",
    archiveExt: ".tar.gz",
    commandName: "unisat-ai",
    launcher: "#!/usr/bin/env sh\nDIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)\nexec \"$DIR/node/bin/node\" \"$DIR/packages/cli/bin/unisat-ai.js\" \"$@\"\n",
  },
  "macos-x64": {
    nodePlatform: "darwin-x64",
    nodeExecutable: "bin/node",
    archiveExt: ".tar.gz",
    commandName: "unisat-ai",
    launcher: "#!/usr/bin/env sh\nDIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)\nexec \"$DIR/node/bin/node\" \"$DIR/packages/cli/bin/unisat-ai.js\" \"$@\"\n",
  },
  "macos-arm64": {
    nodePlatform: "darwin-arm64",
    nodeExecutable: "bin/node",
    archiveExt: ".tar.gz",
    commandName: "unisat-ai",
    launcher: "#!/usr/bin/env sh\nDIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)\nexec \"$DIR/node/bin/node\" \"$DIR/packages/cli/bin/unisat-ai.js\" \"$@\"\n",
  },
};

function parseArgs(argv) {
  const options = { targets: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target") {
      options.targets.push(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--all") {
      options.targets = Object.keys(targets);
      continue;
    }
    if (arg === "--help") {
      options.help = true;
    }
  }
  if (options.targets.length === 0) {
    options.targets = [detectHostTarget()];
  }
  return options;
}

function detectHostTarget() {
  const arch = os.arch() === "arm64" ? "arm64" : "x64";
  if (process.platform === "win32") {
    return `windows-${arch}`;
  }
  if (process.platform === "darwin") {
    return `macos-${arch}`;
  }
  return `linux-${arch}`;
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

async function runZipCommand(args, options = {}) {
  if (process.platform === "win32") {
    await run("powershell.exe", ["-NoProfile", "-Command", options.powershellScript]);
    return;
  }
  await run(args[0] === "-q" ? "unzip" : "zip", args, { cwd: options.cwd });
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyTree(sourceDir, targetDir, predicate = () => true) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyTree(sourcePath, targetPath, predicate);
      continue;
    }
    if (!predicate(sourcePath)) {
      continue;
    }
    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function nodeArchiveName(target) {
  const ext = target.nodePlatform.startsWith("win-") ? ".zip" : ".tar.xz";
  return `node-v${nodeVersion}-${target.nodePlatform}${ext}`;
}

function nodeRuntimeDir(target) {
  return path.join(cacheDir, `node-v${nodeVersion}-${target.nodePlatform}`);
}

async function download(url, targetPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`download failed ${response.status}: ${url}`);
  }
  ensureDir(path.dirname(targetPath));
  const file = fs.createWriteStream(targetPath);
  await new Promise((resolve, reject) => {
    response.body.pipeTo(
      new WritableStream({
        write(chunk) {
          file.write(Buffer.from(chunk));
        },
        close() {
          file.end(resolve);
        },
        abort(error) {
          file.destroy(error);
          reject(error);
        },
      })
    ).catch(reject);
  });
}

async function ensureNodeRuntime(target) {
  const runtimeDir = nodeRuntimeDir(target);
  if (fs.existsSync(path.join(runtimeDir, target.nodeExecutable))) {
    return runtimeDir;
  }

  ensureDir(cacheDir);
  const archive = nodeArchiveName(target);
  const archivePath = path.join(cacheDir, archive);
  if (!fs.existsSync(archivePath)) {
    const url = `https://nodejs.org/dist/v${nodeVersion}/${archive}`;
    console.log(`download ${url}`);
    await download(url, archivePath);
  }

  fs.rmSync(runtimeDir, { recursive: true, force: true });
  if (archive.endsWith(".zip")) {
    await runZipCommand(["-q", archivePath, "-d", cacheDir], {
      powershellScript: `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${cacheDir}' -Force`,
    });
  } else {
    await run("tar", ["-xf", archivePath, "-C", cacheDir]);
  }

  if (!fs.existsSync(path.join(runtimeDir, target.nodeExecutable))) {
    throw new Error(`node runtime not found after extract: ${runtimeDir}`);
  }
  return runtimeDir;
}

function copyPortableFiles(target, packageDir) {
  const cliTargetDir = path.join(packageDir, "packages", "cli");
  copyTree(path.join(rootDir, "packages", "cli", "bin"), path.join(cliTargetDir, "bin"));
  copyTree(path.join(rootDir, "packages", "cli", "src"), path.join(cliTargetDir, "src"), (filePath) => filePath.endsWith(".js"));
  fs.copyFileSync(path.join(rootDir, "packages", "cli", "package.json"), path.join(cliTargetDir, "package.json"));

  const swaggerSource = process.env.OPENAPI_SWAGGER_DIR || path.join(rootDir, "swagger");
  copyTree(swaggerSource, path.join(cliTargetDir, "vendor", "openapi-swagger"), (filePath) => filePath.endsWith(".yaml"));

  fs.writeFileSync(
    path.join(packageDir, "README.txt"),
    [
      "UniSat AI CLI portable package",
      "",
      target.commandName.endsWith(".cmd") ? "Run: .\\unisat-ai.cmd --help" : "Run: ./unisat-ai --help",
      "",
      "Configure API keys:",
      target.commandName.endsWith(".cmd")
        ? ".\\unisat-ai.cmd config bitcoin-key --api-key YOUR_BITCOIN_KEY"
        : "./unisat-ai config bitcoin-key --api-key YOUR_BITCOIN_KEY",
      target.commandName.endsWith(".cmd")
        ? ".\\unisat-ai.cmd config fractal-key --api-key YOUR_FRACTAL_KEY"
        : "./unisat-ai config fractal-key --api-key YOUR_FRACTAL_KEY",
      "",
      "Register API key: https://developer.unisat.io/",
      "",
    ].join("\n"),
    "utf8"
  );
}

function copyNodeRuntime(runtimeDir, packageDir) {
  copyTree(runtimeDir, path.join(packageDir, "node"), (filePath) => {
    const relative = path.relative(runtimeDir, filePath).replace(/\\/g, "/");
    return (
      relative === "node.exe" ||
      relative === "bin/node" ||
      relative.startsWith("lib/") ||
      relative.startsWith("share/") ||
      relative.endsWith("LICENSE")
    );
  });
}

async function archivePackage(packageDir, targetName, target) {
  const outputPath = path.join(distDir, `unisat-ai-${targetName}${target.archiveExt}`);
  fs.rmSync(outputPath, { force: true });
  if (target.archiveExt === ".zip") {
    await runZipCommand(["-qr", outputPath, path.basename(packageDir)], {
      cwd: distDir,
      powershellScript: `Compress-Archive -LiteralPath '${packageDir}' -DestinationPath '${outputPath}' -Force`,
    });
  } else {
    await run("tar", ["-czf", outputPath, "-C", distDir, path.basename(packageDir)]);
  }
  return outputPath;
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function buildTarget(targetName) {
  const target = targets[targetName];
  if (!target) {
    throw new Error(`unknown target ${targetName}. Use one of: ${Object.keys(targets).join(", ")}`);
  }

  const runtimeDir = await ensureNodeRuntime(target);
  const packageDir = path.join(distDir, `unisat-ai-${targetName}`);
  fs.rmSync(packageDir, { recursive: true, force: true });
  ensureDir(packageDir);

  copyNodeRuntime(runtimeDir, packageDir);
  copyPortableFiles(target, packageDir);
  fs.writeFileSync(path.join(packageDir, target.commandName), target.launcher, "utf8");
  if (!target.commandName.endsWith(".cmd")) {
    fs.chmodSync(path.join(packageDir, target.commandName), 0o755);
    fs.chmodSync(path.join(packageDir, "node", "bin", "node"), 0o755);
  }

  const outputPath = await archivePackage(packageDir, targetName, target);
  console.log(`${path.relative(rootDir, outputPath)} ${sha256(outputPath)}`);
  return outputPath;
}

function printHelp() {
  console.log("usage: npm run package:cli -- [--target windows-x64|linux-x64|linux-arm64|macos-x64|macos-arm64] [--all]");
  console.log("");
  console.log("Default target is the current OS/CPU.");
  console.log("The script downloads official Node.js runtimes and creates portable archives in dist/portable-cli.");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  ensureDir(distDir);
  const outputs = [];
  for (const targetName of options.targets) {
    outputs.push(await buildTarget(targetName));
  }
  const checksumPath = path.join(distDir, "checksums.txt");
  fs.writeFileSync(
    checksumPath,
    outputs.map((outputPath) => `${sha256(outputPath)}  ${path.basename(outputPath)}`).join("\n") + "\n",
    "utf8"
  );
  console.log(`wrote ${path.relative(rootDir, checksumPath)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
