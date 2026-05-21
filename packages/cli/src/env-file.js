const fs = require("fs");
const os = require("os");
const path = require("path");

function getUserConfigDir() {
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, "unisat-ai");
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "unisat-ai");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "unisat-ai");
  }
  return path.join(os.homedir(), ".config", "unisat-ai");
}

function getDotEnvPath() {
  return process.env.UNISAT_AI_ENV_FILE || path.join(getUserConfigDir(), ".env");
}

function parseDotEnv(content) {
  const values = {};
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      return;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) {
      values[key] = value;
    }
  });
  return values;
}

function readDotEnv(envPath = getDotEnvPath()) {
  if (!fs.existsSync(envPath)) {
    return {};
  }
  return parseDotEnv(fs.readFileSync(envPath, "utf8"));
}

function quoteDotEnvValue(value) {
  const raw = String(value);
  if (/^[A-Za-z0-9_./:@+-]+$/.test(raw)) {
    return raw;
  }
  return `"${raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function upsertDotEnvValue(key, value, envPath = getDotEnvPath()) {
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const lines = existing ? existing.split(/\r?\n/) : [];
  const output = [];
  let replaced = false;
  const assignment = `${key}=${quoteDotEnvValue(value)}`;

  lines.forEach((line) => {
    if (!line) {
      output.push(line);
      return;
    }
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match && match[1] === key) {
      if (!replaced) {
        output.push(assignment);
        replaced = true;
      }
      return;
    }
    output.push(line);
  });

  if (!replaced) {
    if (output.length > 0 && output[output.length - 1] !== "") {
      output.push("");
    }
    output.push(assignment);
  }

  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, output.join(os.EOL).replace(new RegExp(`${os.EOL}+$`), "") + os.EOL, "utf8");

  return {
    envPath,
    key,
  };
}

function getConfiguredValue(key) {
  return process.env[key] || readDotEnv()[key] || "";
}

module.exports = {
  getConfiguredValue,
  getDotEnvPath,
  getUserConfigDir,
  readDotEnv,
  upsertDotEnvValue,
};
