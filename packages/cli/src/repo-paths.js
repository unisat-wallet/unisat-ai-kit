const path = require("path");

function resolveRepoPath(envName, fallbackSegments) {
  return process.env[envName] || path.resolve(__dirname, "..", "..", "..", ...fallbackSegments);
}

function getSourceRoots() {
  return {
    unisatDevDocsDir: resolveRepoPath("UNISAT_DEV_DOCS_DIR", ["..", "unisat-dev-docs"]),
    openapiSwaggerDir: resolveRepoPath("OPENAPI_SWAGGER_DIR", ["..", "openapi-swagger"]),
  };
}

module.exports = {
  getSourceRoots,
};
