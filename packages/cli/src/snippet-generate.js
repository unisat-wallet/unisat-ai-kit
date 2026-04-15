const { getOpenApiDetail } = require("./openapi-utils");

function exampleValue(parameter) {
  if (parameter.type === "integer" || parameter.type === "number") {
    return "1";
  }
  if (parameter.type === "boolean") {
    return "true";
  }
  if (parameter.name.toLowerCase().includes("address")) {
    return "YOUR_ADDRESS";
  }
  if (parameter.name.toLowerCase().includes("ticker") || parameter.name.toLowerCase().includes("tick")) {
    return "ordi";
  }
  if (parameter.name.toLowerCase().includes("id")) {
    return "YOUR_ID";
  }
  return `YOUR_${parameter.name.toUpperCase()}`;
}

function buildResolvedPath(apiPath, pathParams) {
  let resolvedPath = apiPath;
  pathParams.forEach((parameter) => {
    resolvedPath = resolvedPath.replace(`{${parameter.name}}`, exampleValue(parameter));
  });
  return resolvedPath;
}

function buildQueryEntries(parameters) {
  return parameters
    .filter((parameter) => parameter.in === "query")
    .map((parameter) => ({
      name: parameter.name,
      required: parameter.required,
      description: parameter.description,
      value: exampleValue(parameter),
    }));
}

function buildQueryString(entries) {
  if (entries.length === 0) {
    return "";
  }

  return entries
    .map((entry) => `${encodeURIComponent(entry.name)}=${encodeURIComponent(entry.value)}`)
    .join("&");
}

function buildCurlSnippet(detail, baseUrl, resolvedPath, queryEntries) {
  const queryString = buildQueryString(queryEntries);
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
  const detail = getOpenApiDetail(apiPath);
  if (!detail) {
    return {
      command: "snippet.generate",
      mode: "not_found",
      path: apiPath,
      language,
    };
  }

  const baseUrl = detail.servers[0] || "https://open-api.unisat.io";
  const pathParams = detail.parameters.filter((parameter) => parameter.in === "path");
  const queryEntries = buildQueryEntries(detail.parameters);
  const resolvedPath = buildResolvedPath(detail.path, pathParams);

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
      value: exampleValue(parameter),
    })),
    queryParams: queryEntries,
    hasRequestBody: Boolean(detail.requestBodyTemplate),
    snippet,
  };
}

module.exports = {
  generateSnippet,
};
