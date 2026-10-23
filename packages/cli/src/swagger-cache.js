const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_MANIFEST_URL =
  "https://api-docs.unisat.io/swagger/manifest.json";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_SWAGGER_FILE_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30000;
const REQUEST_ATTEMPTS = 3;

function getSwaggerManifestUrl() {
  return process.env.UNISAT_OPENAPI_MANIFEST_URL || DEFAULT_MANIFEST_URL;
}

function getSwaggerCacheDir() {
  if (process.env.UNISAT_OPENAPI_CACHE_DIR) {
    return path.resolve(process.env.UNISAT_OPENAPI_CACHE_DIR);
  }
  if (process.env.XDG_CACHE_HOME) {
    return path.join(process.env.XDG_CACHE_HOME, "unisat-ai-kit", "swagger");
  }
  if (process.platform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA ||
        path.join(os.homedir(), "AppData", "Local"),
      "unisat-ai-kit",
      "Cache",
      "swagger"
    );
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Caches",
      "unisat-ai-kit",
      "swagger"
    );
  }
  return path.join(os.homedir(), ".cache", "unisat-ai-kit", "swagger");
}

function statePath() {
  return path.join(getSwaggerCacheDir(), "state.json");
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return null;
  }
}

function readState() {
  return readJson(statePath());
}

function resolveStateSwaggerDir(state) {
  if (!state || typeof state.swaggerDir !== "string") {
    return "";
  }
  const cacheDir = getSwaggerCacheDir();
  const swaggerDir = path.resolve(cacheDir, state.swaggerDir);
  if (
    swaggerDir !== cacheDir &&
    !swaggerDir.startsWith(`${cacheDir}${path.sep}`)
  ) {
    return "";
  }
  return fs.existsSync(swaggerDir) ? swaggerDir : "";
}

function getCachedSwaggerDir() {
  return resolveStateSwaggerDir(readState());
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function validateHash(value, label) {
  if (!/^[a-f0-9]{64}$/.test(String(value || ""))) {
    throw new Error(`invalid ${label} sha256`);
  }
}

function validateManifest(manifest, manifestUrl) {
  if (!manifest || manifest.schemaVersion !== 1) {
    throw new Error("unsupported swagger manifest schemaVersion");
  }
  if (!manifest.bundle || !Array.isArray(manifest.files)) {
    throw new Error("invalid swagger manifest structure");
  }
  validateHash(manifest.bundle.sha256, "bundle");
  if (manifest.files.length === 0) {
    throw new Error("swagger manifest contains no files");
  }

  const names = new Set();
  const manifestOrigin = new URL(manifestUrl).origin;
  manifest.files.forEach((file) => {
    if (!file || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(file.name || "")) {
      throw new Error("swagger manifest contains an invalid file name");
    }
    if (names.has(file.name)) {
      throw new Error(`swagger manifest contains duplicate file: ${file.name}`);
    }
    names.add(file.name);
    validateHash(file.sha256, file.name);
    if (typeof file.path !== "string" || !file.path) {
      throw new Error(`swagger manifest contains an invalid path: ${file.name}`);
    }
    const fileUrl = new URL(file.path, manifestUrl);
    if (fileUrl.origin !== manifestOrigin) {
      throw new Error(`swagger file must use manifest origin: ${file.name}`);
    }
  });

  return manifest;
}

async function readResponse(response, maxBytes, label) {
  if (!response.ok) {
    throw new Error(`${label} download failed: HTTP ${response.status}`);
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxBytes) {
    throw new Error(`${label} exceeds ${maxBytes} bytes`);
  }
  const content = Buffer.from(await response.arrayBuffer());
  if (content.length > maxBytes) {
    throw new Error(`${label} exceeds ${maxBytes} bytes`);
  }
  return content;
}

async function fetchWithRetry(fetchImpl, url, options, label) {
  let lastError;
  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        ...options,
        signal: controller.signal,
      });
      if (response.ok || (response.status < 500 && response.status !== 429)) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === REQUEST_ATTEMPTS) {
        break;
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`${label} download failed: ${lastError?.message || "unknown error"}`);
}

function requestUrl(rawUrl, token) {
  const url = new URL(rawUrl);
  url.searchParams.set("_", token);
  return url.href;
}

async function downloadManifest(fetchImpl) {
  const manifestUrl = getSwaggerManifestUrl();
  const response = await fetchWithRetry(
    fetchImpl,
    requestUrl(manifestUrl, Date.now()),
    {
      headers: { accept: "application/json" },
      cache: "no-store",
    },
    "swagger manifest"
  );
  const content = await readResponse(
    response,
    MAX_MANIFEST_BYTES,
    "swagger manifest"
  );
  let manifest;
  try {
    manifest = JSON.parse(content.toString("utf8"));
  } catch (error) {
    throw new Error(`invalid swagger manifest JSON: ${error.message}`);
  }
  return validateManifest(manifest, manifestUrl);
}

function writeJsonAtomically(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

function swaggerLooksValid(content, name) {
  const text = content.toString("utf8");
  if (!/^openapi:\s*3\./m.test(text) || !/^paths:\s*(?:$|\[|\{)/m.test(text)) {
    throw new Error(`downloaded swagger file is invalid: ${name}`);
  }
}

async function downloadSwaggerVersion(manifest, fetchImpl) {
  const cacheDir = getSwaggerCacheDir();
  const versionName = `${manifest.bundle.sha256}-${Date.now()}`;
  const targetDir = path.join(cacheDir, "versions", versionName);
  const stagingDir = path.join(
    cacheDir,
    `staging-${process.pid}-${Date.now()}`
  );
  const filesDir = path.join(stagingDir, "files");
  fs.mkdirSync(filesDir, { recursive: true });

  try {
    for (const file of manifest.files) {
      const fileUrl = new URL(file.path, getSwaggerManifestUrl());
      const response = await fetchWithRetry(
        fetchImpl,
        requestUrl(fileUrl.href, file.sha256),
        { cache: "no-store" },
        `swagger file ${file.name}`
      );
      const content = await readResponse(
        response,
        MAX_SWAGGER_FILE_BYTES,
        `swagger file ${file.name}`
      );
      if (Number.isInteger(file.size) && content.length !== file.size) {
        throw new Error(`swagger file size mismatch: ${file.name}`);
      }
      if (sha256(content) !== file.sha256) {
        throw new Error(`swagger file hash mismatch: ${file.name}`);
      }
      swaggerLooksValid(content, file.name);
      fs.writeFileSync(path.join(filesDir, `${file.name}.yaml`), content);
    }

    fs.writeFileSync(
      path.join(stagingDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.renameSync(stagingDir, targetDir);
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }

  return targetDir;
}

function stateIsUsable(state) {
  const swaggerDir = resolveStateSwaggerDir(state);
  if (!state || !swaggerDir || !Array.isArray(state.files)) {
    return false;
  }
  return state.files.every((name) =>
    fs.existsSync(path.join(swaggerDir, `${name}.yaml`))
  );
}

function getTtlMs() {
  const configured = Number(process.env.UNISAT_OPENAPI_CACHE_TTL_MS);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_TTL_MS;
}

function statusFromState(state, extra = {}) {
  return {
    available: stateIsUsable(state),
    source: getSwaggerManifestUrl(),
    cacheDir: getSwaggerCacheDir(),
    swaggerDir: resolveStateSwaggerDir(state),
    version: state?.version || "",
    bundleHash: state?.bundleHash || "",
    downloadedAt: state?.downloadedAt || "",
    lastCheckedAt: state?.lastCheckedAt || "",
    files: Array.isArray(state?.files) ? state.files.length : 0,
    ...extra,
  };
}

function getSwaggerCacheStatus() {
  if (process.env.OPENAPI_SWAGGER_DIR) {
    const swaggerDir = path.resolve(process.env.OPENAPI_SWAGGER_DIR);
    return {
      available: fs.existsSync(swaggerDir),
      source: "OPENAPI_SWAGGER_DIR",
      cacheDir: "",
      swaggerDir,
      version: "override",
      bundleHash: "",
      downloadedAt: "",
      lastCheckedAt: "",
      files: fs.existsSync(swaggerDir)
        ? fs.readdirSync(swaggerDir).filter((name) => name.endsWith(".yaml"))
            .length
        : 0,
    };
  }
  return statusFromState(readState());
}

async function refreshSwaggerCache(options = {}) {
  if (process.env.OPENAPI_SWAGGER_DIR) {
    return getSwaggerCacheStatus();
  }
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("this Node.js runtime does not provide fetch");
  }

  const previousState = readState();
  const manifest = await downloadManifest(fetchImpl);
  const now = new Date().toISOString();
  const unchanged =
    !options.force &&
    stateIsUsable(previousState) &&
    previousState.bundleHash === manifest.bundle.sha256;

  let targetDir;
  if (unchanged) {
    targetDir = path.dirname(getCachedSwaggerDir());
  } else {
    targetDir = await downloadSwaggerVersion(manifest, fetchImpl);
  }

  const cacheDir = getSwaggerCacheDir();
  const state = {
    schemaVersion: 1,
    version: String(manifest.version || ""),
    bundleHash: manifest.bundle.sha256,
    swaggerDir: path.relative(cacheDir, path.join(targetDir, "files")),
    files: manifest.files.map((file) => file.name),
    downloadedAt: unchanged ? previousState.downloadedAt : now,
    lastCheckedAt: now,
  };
  writeJsonAtomically(statePath(), state);
  return statusFromState(state, { refreshed: !unchanged });
}

async function ensureSwaggerCache(options = {}) {
  if (process.env.OPENAPI_SWAGGER_DIR) {
    const status = getSwaggerCacheStatus();
    if (!status.available) {
      throw new Error(`OPENAPI_SWAGGER_DIR does not exist: ${status.swaggerDir}`);
    }
    return status;
  }

  const currentState = readState();
  const usable = stateIsUsable(currentState);
  const lastChecked = Date.parse(currentState?.lastCheckedAt || "");
  const fresh =
    usable &&
    Number.isFinite(lastChecked) &&
    Date.now() - lastChecked < getTtlMs();
  if (!options.force && fresh) {
    return statusFromState(currentState, { refreshed: false });
  }

  try {
    return await refreshSwaggerCache(options);
  } catch (error) {
    if (usable && options.allowStale !== false) {
      return statusFromState(currentState, {
        refreshed: false,
        stale: true,
        warning: error.message,
      });
    }
    throw new Error(
      `unable to initialize Swagger cache: ${error.message}. Run \"unisat-openapi-cli swagger refresh\" when network access is available.`
    );
  }
}

module.exports = {
  DEFAULT_MANIFEST_URL,
  ensureSwaggerCache,
  getCachedSwaggerDir,
  getSwaggerCacheDir,
  getSwaggerCacheStatus,
  getSwaggerManifestUrl,
  refreshSwaggerCache,
};
