const { buildRequestPlan } = require("./openapi-request");

function buildCurlSnippet(detail, baseUrl, resolvedPath, queryEntries) {
  const queryString = queryEntries
    .map((entry) => `${encodeURIComponent(entry.name)}=${encodeURIComponent(entry.value)}`)
    .join("&");
  const url = queryString ? `${baseUrl}${resolvedPath}?${queryString}` : `${baseUrl}${resolvedPath}`;
  const lines = [
    `curl --request ${detail.method.toUpperCase()} \\`,
    `  --url '${url}' \\`,
    "  --header 'Authorization: Bearer YOUR_API_KEY'",
  ];

  if (detail.requestBodyTemplate) {
    lines.push("  --header 'Content-Type: application/json' \\");
    lines.push(`  --data '${JSON.stringify(detail.requestBodyTemplate, null, 2)}'`);
  }

  return lines.join("\n");
}

function buildTsFetchSnippet(detail, baseUrl, resolvedPath, queryEntries) {
  const queryString = buildQueryString(queryEntries);
  const url = queryString ? `${baseUrl}${resolvedPath}?${queryString}` : `${baseUrl}${resolvedPath}`;
  const requestLines = [
    `const response = await fetch("${url}", {`,
    `  method: "${detail.method.toUpperCase()}",`,
    "  headers: {",
    '    "Authorization": "Bearer YOUR_API_KEY",',
  ];

  if (detail.requestBodyTemplate) {
    requestLines.push('    "Content-Type": "application/json",');
  }

  requestLines.push("  },");

  if (detail.requestBodyTemplate) {
    requestLines.push(`  body: JSON.stringify(${JSON.stringify(detail.requestBodyTemplate, null, 2)}),`);
  }

  requestLines.push("});");
  requestLines.push("");
  requestLines.push("const data = await response.json();");
  requestLines.push("console.log(data);");

  return requestLines.join("\n");
}

function generateSnippet({ apiPath, language }) {
  const plan = buildRequestPlan(apiPath);
  if (!plan) {
    return {
      command: "snippet.generate",
      mode: "not_found",
      path: apiPath,
      language,
    };
  }

  const { detail, baseUrl, pathParams, queryEntries, resolvedPath } = plan;

  const snippet =
    language === "typescript"
      ? buildTsFetchSnippet(detail, baseUrl, resolvedPath, queryEntries)
      : buildCurlSnippet(detail, baseUrl, resolvedPath, queryEntries);

  return {
    command: "snippet.generate",
    mode: "detail",
    language,
    path: detail.path,
    method: detail.method,
    file: detail.file,
    operationId: detail.operationId,
    summary: detail.summary,
    baseUrl,
    pathParams: pathParams.map((parameter) => ({
      name: parameter.name,
      value: parameter.value,
    })),
    queryParams: queryEntries,
    hasRequestBody: Boolean(detail.requestBodyTemplate),
    snippet,
  };
}

module.exports = {
  generateSnippet,
};
