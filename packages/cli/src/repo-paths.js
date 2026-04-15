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
  return {
    unisatDevDocsDir: resolveRepoPath(
      "UNISAT_DEV_DOCS_DIR",
      ["unisat-dev-docs"],
      ["..", "unisat-dev-docs"]
    ),
    openapiSwaggerDir: resolveRepoPath(
      "OPENAPI_SWAGGER_DIR",
      ["openapi-swagger"],
      ["..", "openapi-swagger"]
    ),
  };
}

module.exports = {
  getSourceRoots,
};
