function isReadOnly(method, extensions = {}) {
  return typeof extensions["x-unisat-readonly"] === "boolean"
    ? extensions["x-unisat-readonly"] : String(method).toLowerCase() === "get";
}

function requiresConfirmation(method, extensions = {}) {
  return typeof extensions["x-unisat-requires-confirmation"] === "boolean"
    ? extensions["x-unisat-requires-confirmation"] : !isReadOnly(method, extensions);
}

// Preserve the source schema rather than approximating YAML types or dropping
// nested fields. This also works with the embedded Swagger asset in the SEA.
function yamlBlock(lines, index) {
  if (index < 0) return [];
  const indent = lines[index].search(/\S/);
  let end = index + 1;
  while (end < lines.length && (!lines[end].trim() || lines[end].search(/\S/) > indent)) end += 1;
  return lines.slice(index, end);
}

function localReference(lines, ref) {
  if (!ref.startsWith("#/")) return [];
  let scope = lines;
  let indent = 0;
  for (const part of ref.slice(2).split("/").map(value => value.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    const index = scope.findIndex(line => line.search(/\S/) === indent
      && [part + ":", JSON.stringify(part) + ":", "'" + part + "':"].includes(line.trim()));
    scope = yamlBlock(scope, index);
    if (!scope.length) return [];
    indent += 2;
  }
  return scope;
}

function unindent(lines) {
  const indent = lines[0]?.search(/\S/) || 0;
  return lines.map(line => line.slice(indent)).join("\n").trimEnd();
}

function requestBodySummary(lines, fileLines = lines) {
  let inBody = false;
  let required = false;
  const contentTypes = [];
  for (const line of lines) {
    if (/^\s{6}requestBody:\s*$/.test(line)) { inBody = true; continue; }
    if (inBody && /^\s{6}\S/.test(line)) inBody = false;
    if (!inBody) continue;
    const type = line.match(/^\s{10}([A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+):\s*$/);
    if (type) contentTypes.push(type[1]);
    if (/^\s{8}required:\s*true\s*$/.test(line)) required = true;
  }
  const bodyLines = yamlBlock(lines, lines.findIndex(line => /^\s{6}requestBody:\s*$/.test(line)));
  if (!bodyLines.length) return { required, contentTypes };
  const definitionYaml = unindent(bodyLines);
  const referencedSchemas = {};
  const unresolvedReferences = [];
  const visited = new Set();
  const queue = [definitionYaml];
  while (queue.length) {
    for (const match of queue.shift().matchAll(/\$ref:\s*["']?([^\s"']+)["']?/g)) {
      const ref = match[1];
      if (visited.has(ref)) continue;
      visited.add(ref);
      const reference = localReference(fileLines, ref);
      if (!reference.length) { unresolvedReferences.push(ref); continue; }
      const definition = unindent(reference);
      referencedSchemas[ref] = definition;
      queue.push(definition);
    }
  }
  return { required, contentTypes, definitionYaml, referencedSchemas,
    ...(unresolvedReferences.length ? { unresolvedReferences } : {}) };
}

function validateBody(body, detail) {
  if (body === undefined || body === null || body === "") {
    return detail.requestBody?.required
      ? { mode: "missing_body", message: "Missing required JSON request body. Supply --body '<json>'." }
      : null;
  }
  if (["get", "head"].includes(String(detail.method).toLowerCase())) {
    return { mode: "invalid_body", message: "GET and HEAD requests must not include a body." };
  }
  try {
    if (JSON.parse(body) === null && detail.requestBody?.required) {
      return { mode: "missing_body", message: "A required JSON request body must not be null." };
    }
  } catch (_) {
    return { mode: "invalid_body", message: "Request body is not valid JSON. Check --body quoting and syntax." };
  }
  return null;
}

module.exports = { isReadOnly, requiresConfirmation, requestBodySummary, validateBody };
