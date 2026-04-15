const path = require("path");
const { getOpenApiDetail, collectPathBlocks, extractMethods, extractScalar, getSwaggerContext } = require("./openapi-utils");

function explainOpenApi({ apiPath, keyword }) {
  const { openapiSwaggerDir, swaggerDir } = getSwaggerContext();
  const blocks = collectPathBlocks(swaggerDir);

  if (keyword) {
    const normalizedKeyword = keyword.toLowerCase();
    const matches = blocks
      .filter((item) => item.path.toLowerCase().includes(normalizedKeyword))
      .flatMap((item) => {
        const methods = extractMethods(item.blockLines);
        return methods.map((method) => ({
          file: path.relative(openapiSwaggerDir, item.filePath),
          path: item.path,
          method,
          summary: extractScalar(item.blockLines, /^\s{6}summary:\s+/),
        }));
      });

    return {
      command: "openapi.explain",
      mode: "matches",
      keyword,
      sourceRoot: swaggerDir,
      matches,
    };
  }

  const detail = getOpenApiDetail(apiPath);
  if (!detail) {
    return {
      command: "openapi.explain",
      mode: "not_found",
      path: apiPath,
      sourceRoot: swaggerDir,
      matches: [],
    };
  }

  return {
    command: "openapi.explain",
    mode: "detail",
    ...detail,
  };
}

module.exports = {
  explainOpenApi,
};
