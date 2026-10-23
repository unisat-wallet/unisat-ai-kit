const fs = require("fs");
const path = require("path");
const { getCachedSwaggerDir } = require("./swagger-cache");

let runtimeSwaggerDir = "";

function setSwaggerRuntimeDir(swaggerDir) {
  runtimeSwaggerDir = swaggerDir ? path.resolve(swaggerDir) : "";
}

function resolveSwaggerDir() {
  if (process.env.OPENAPI_SWAGGER_DIR) {
    return path.resolve(process.env.OPENAPI_SWAGGER_DIR);
  }

  if (runtimeSwaggerDir && fs.existsSync(runtimeSwaggerDir)) {
    return runtimeSwaggerDir;
  }

  const cachedSwaggerDir = getCachedSwaggerDir();
  if (cachedSwaggerDir && fs.existsSync(cachedSwaggerDir)) {
    return cachedSwaggerDir;
  }

  throw new Error(
    'Swagger cache is unavailable. Run "unisat-openapi-cli swagger refresh" first.'
  );
}

function getSourceRoots() {
  return {
    openapiSwaggerDir: resolveSwaggerDir(),
    repoRoot: path.resolve(__dirname, "..", "..", ".."),
  };
}

module.exports = {
  getSourceRoots,
  setSwaggerRuntimeDir,
};
