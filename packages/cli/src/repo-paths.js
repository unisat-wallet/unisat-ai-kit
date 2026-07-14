const fs = require("fs");
const path = require("path");

function resolveBundledPath(...segments) {
  return path.resolve(__dirname, "..", "vendor", ...segments);
}

function resolveRepoPath(envName, bundledSegments, fallbackSegments) {
  if (process.env[envName]) {
    return process.env[envName];
  }

  const bundledPath = resolveBundledPath(...bundledSegments);
  if (fs.existsSync(bundledPath)) {
    return bundledPath;
  }

  return path.resolve(__dirname, "..", "..", "..", ...fallbackSegments);
}

function getSourceRoots() {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");

  return {
    openapiSwaggerDir: resolveRepoPath(
      "OPENAPI_SWAGGER_DIR",
      ["openapi-swagger"],
      ["swagger"]
    ),
    repoRoot,
  };
}

module.exports = {
  getSourceRoots,
};
