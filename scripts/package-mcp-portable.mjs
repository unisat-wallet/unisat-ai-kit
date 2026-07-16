import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist", "portable-mcp");

const targets = {
  "windows-x64": {
    archiveExt: ".zip",
    commandName: "unisat-openapi-mcp.cmd",
    launcher: "@echo off\r\n%~dp0\\node_modules\\.bin\\unisat-openapi-mcp.cmd %*\r\n",
  },
  "linux-x64": {
    archiveExt: ".tar.gz",
    commandName: "unisat-openapi-mcp",
    launcher: "#!/usr/bin/env sh\nDIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)\nexec \"$DIR/node_modules/.bin/unisat-openapi-mcp\" \"$@\"\n",
  },
  "linux-arm64": {
    archiveExt: ".tar.gz",
    commandName: "unisat-openapi-mcp",
    launcher: "#!/usr/bin/env sh\nDIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)\nexec \"$DIR/node_modules/.bin/unisat-openapi-mcp\" \"$@\"\n",
  },
  "macos-x64": {
    archiveExt: ".tar.gz",
    commandName: "unisat-openapi-mcp",
    launcher: "#!/usr/bin/env sh\nDIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)\nexec \"$DIR/node_modules/.bin/unisat-openapi-mcp\" \"$@\"\n",
  },
  "macos-arm64": {
    archiveExt: ".tar.gz",
    commandName: "unisat-openapi-mcp",
    launcher: "#!/usr/bin/env sh\nDIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)\nexec \"$DIR/node_modules/.bin/unisat-openapi-mcp\" \"$@\"\n",
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
      env: options.env || process.env,
      stdio: options.stdio || "inherit",
      shell: options.shell ?? (process.platform === "win32" && command.endsWith(".cmd")),
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

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function runZipCommand(packageDir, outputPath) {
  if (process.platform === "win32") {
    await run("powershell.exe", ["-NoProfile", "-Command", `Compress-Archive -LiteralPath '${packageDir}' -DestinationPath '${outputPath}' -Force`]);
    return;
  }
  await run("zip", ["-qr", outputPath, path.basename(packageDir)], { cwd: distDir });
}

async function packPackage(packageDir) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(npmCommand(), ["pack", "--json"], {
      cwd: packageDir,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`npm pack failed: ${stderr || stdout}`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });
  return path.join(packageDir, result[0].filename);
}

async function installPortableDependencies(packageDir) {
  const cliTarball = await packPackage(path.join(rootDir, "packages", "cli"));
  const mcpTarball = await packPackage(path.join(rootDir, "packages", "mcp-server"));

  try {
    fs.writeFileSync(
      path.join(packageDir, "package.json"),
      JSON.stringify(
        {
          private: true,
          name: "unisat-openapi-mcp-portable",
          version: "0.0.0",
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    await run(npmCommand(), ["install", "--omit=dev", cliTarball, mcpTarball], { cwd: packageDir });
  } finally {
    fs.rmSync(cliTarball, { force: true });
    fs.rmSync(mcpTarball, { force: true });
  }
}

function writeReadme(target, packageDir) {
  fs.writeFileSync(
    path.join(packageDir, "README.txt"),
    [
      "UniSat AI Kit MCP Server portable package",
      "",
      "Configure your agent with the absolute path to the launcher in this directory.",
      "",
      target.commandName.endsWith(".cmd")
        ? "Windows command: C:/absolute/path/to/unisat-openapi-mcp.cmd"
        : "macOS/Linux command: /absolute/path/to/unisat-openapi-mcp",
      "",
      "The package includes production npm dependencies and bundled UniSat OpenAPI swagger data.",
      "Node.js must be available on PATH for this portable package.",
      "",
      "Available MCP tools: get_status, list_environments, resolve_api, show_api, call_api.",
      "Register API key: https://developer.unisat.io/",
      "",
    ].join("\n"),
    "utf8"
  );
}

async function archivePackage(packageDir, targetName, target) {
  const outputPath = path.join(distDir, `unisat-openapi-mcp-${targetName}${target.archiveExt}`);
  fs.rmSync(outputPath, { force: true });
  if (target.archiveExt === ".zip") {
    await runZipCommand(packageDir, outputPath);
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

  const packageDir = path.join(distDir, `unisat-openapi-mcp-${targetName}`);
  fs.rmSync(packageDir, { recursive: true, force: true });
  ensureDir(packageDir);

  await installPortableDependencies(packageDir);
  fs.writeFileSync(path.join(packageDir, target.commandName), target.launcher, "utf8");
  if (!target.commandName.endsWith(".cmd")) {
    fs.chmodSync(path.join(packageDir, target.commandName), 0o755);
  }
  writeReadme(target, packageDir);

  const outputPath = await archivePackage(packageDir, targetName, target);
  console.log(`${path.relative(rootDir, outputPath)} ${sha256(outputPath)}`);
  return outputPath;
}

function printHelp() {
  console.log("usage: npm run package:mcp:portable -- [--target windows-x64|linux-x64|linux-arm64|macos-x64|macos-arm64] [--all]");
  console.log("");
  console.log("Default target is the current OS/CPU.");
  console.log("The script creates portable MCP archives in dist/portable-mcp.");
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
