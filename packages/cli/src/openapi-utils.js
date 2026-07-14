const path = require("path");
let sea = null;
try {
  sea = require("node:sea");
} catch (_error) {
  sea = null;
}
const { getSourceRoots } = require("./repo-paths");
const { walkFiles, readUtf8 } = require("./file-utils");

const SWAGGER_ASSET_NAME = "openapi-swagger.json";
let embeddedSwaggerFiles = null;

function getSwaggerContext() {
  const { openapiSwaggerDir } = getSourceRoots();
  return {
    openapiSwaggerDir,
    swaggerDir: openapiSwaggerDir,
    embedded: getEmbeddedSwaggerFiles() !== null,
  };
}

function getEmbeddedSwaggerFiles() {
  if (embeddedSwaggerFiles !== null) {
    return embeddedSwaggerFiles;
  }

  embeddedSwaggerFiles = false;
  if (!sea || !sea.isSea()) {
    return null;
  }

  try {
    const raw = sea.getAsset(SWAGGER_ASSET_NAME, "utf8");
    embeddedSwaggerFiles = JSON.parse(raw);
    return embeddedSwaggerFiles;
  } catch (_error) {
    return null;
  }
}

function collectPathBlocks(swaggerDir) {
  const embeddedFiles = getEmbeddedSwaggerFiles();
  const files = embeddedFiles
    ? Object.keys(embeddedFiles).sort()
    : walkFiles(swaggerDir, (filePath) => filePath.endsWith(".yaml")).sort();
  const blocks = [];

  files.forEach((filePath) => {
    const content = embeddedFiles ? embeddedFiles[filePath] : readUtf8(filePath);
    const lines = content.split(/\r?\n/);
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];
      const pathMatch = line.match(/^  (\/[^:]+):\s*$/);
      if (!pathMatch) {
        index += 1;
        continue;
      }

      const apiPath = pathMatch[1];
      const blockLines = [line];
      index += 1;

      while (index < lines.length) {
        const nextLine = lines[index];
        if (/^  \/.+:\s*$/.test(nextLine) || /^components:\s*$/.test(nextLine)) {
          break;
        }
        blockLines.push(nextLine);
        index += 1;
      }

      blocks.push({
        filePath,
        path: apiPath,
        blockLines,
        fileLines: lines,
      });
    }
  });

  return blocks;
}

function extractScalar(lines, pattern) {
  const index = lines.findIndex((line) => pattern.test(line));
  if (index === -1) {
    return "";
  }

  const value = lines[index].replace(pattern, "").trim();
  if (value !== ">-" && value !== "|" && value !== ">") {
    return value.replace(/^[\'"]|[\'"]$/g, "");
  }

  const chunks = [];
  for (let lineIndex = index + 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!/^\s{8,}/.test(line)) {
      break;
    }
    chunks.push(line.trim());
  }

  return chunks.join(" ").trim();
}

function extractTags(lines) {
  const tags = [];
  let inTags = false;

  lines.forEach((line) => {
    if (/^\s{6}tags:\s*$/.test(line)) {
      inTags = true;
      return;
    }

    if (inTags && /^\s{8}-\s+/.test(line)) {
      tags.push(line.replace(/^\s{8}-\s+/, "").trim());
      return;
    }

    if (inTags && !/^\s{8}/.test(line)) {
      inTags = false;
    }
  });

  return tags;
}

function createParameter() {
  return {
    name: "",
    in: "",
    required: false,
    description: "",
    type: "",
  };
}

function normalizeYamlScalar(value) {
  return value.trim().replace(/^[\'"]|[\'"]$/g, "");
}

function extractParameters(lines) {
  const parameters = [];
  let current = null;
  let inParameters = false;
  let inSchema = false;

  function pushCurrent() {
    if (current && current.name) {
      parameters.push(current);
    }
    current = null;
    inSchema = false;
  }

  lines.forEach((line) => {
    if (/^\s{6}parameters:\s*$/.test(line)) {
      inParameters = true;
      return;
    }

    if (!inParameters) {
      return;
    }

    if (/^\s{6}(responses|requestBody):\s*$/.test(line) || /^\s{4}(get|post|put|delete|patch|options|head):\s*$/.test(line) || /^\s{2}\/.+:\s*$/.test(line)) {
      pushCurrent();
      inParameters = false;
      return;
    }

    if (/^\s{8}-\s+/.test(line)) {
      pushCurrent();
      current = createParameter();
      const inline = line.replace(/^\s{8}-\s+/, "");
      const inlineMatch = inline.match(/^(name|in|required|description|schema):\s*(.*)$/);
      if (inlineMatch) {
        const [, key, rawValue] = inlineMatch;
        if (key === "schema") {
          inSchema = true;
        } else if (key === "required") {
          current.required = rawValue.trim() === "true";
        } else {
          current[key] = normalizeYamlScalar(rawValue);
        }
      }
      return;
    }

    if (!current) {
      if (!/^\s{8,}/.test(line)) {
        inParameters = false;
      }
      return;
    }

    if (/^\s{10}schema:\s*$/.test(line)) {
      inSchema = true;
      return;
    }

    const propertyMatch = line.match(/^\s{10}(name|in|required|description):\s+(.+)\s*$/);
    if (propertyMatch) {
      const [, key, rawValue] = propertyMatch;
      if (key === "required") {
        current.required = rawValue.trim() === "true";
      } else {
        current[key] = normalizeYamlScalar(rawValue);
      }
      inSchema = false;
      return;
    }

    if (inSchema) {
      const typeMatch = line.match(/^\s{12}type:\s+(.+)\s*$/);
      if (typeMatch) {
        current.type = normalizeYamlScalar(typeMatch[1]);
      }
    }
  });

  pushCurrent();

  return parameters;
}

function extractMethods(blockLines) {
  return blockLines
    .filter((line) => /^\s{4}(get|post|put|delete|patch|options|head):\s*$/.test(line))
    .map((line) => line.trim().replace(":", ""));
}

function extractServers(fileLines) {
  const servers = [];
  let inServers = false;

  fileLines.forEach((line) => {
    if (/^servers:\s*$/.test(line)) {
      inServers = true;
      return;
    }

    if (!inServers) {
      return;
    }

    if (/^tags:\s*$/.test(line) || /^paths:\s*$/.test(line)) {
      inServers = false;
      return;
    }

    const match = line.match(/^\s*-\s+url:\s+(.+)\s*$/);
    if (match) {
      servers.push(match[1].trim().replace(/^[\'"]|[\'"]$/g, ""));
    }
  });

  return servers;
}

function buildRequestBodyTemplate(lines) {
  const body = {};
  let inRequestBody = false;
  let inProperties = false;
  let currentProperty = null;

  lines.forEach((line) => {
    if (/^\s{6}requestBody:\s*$/.test(line)) {
      inRequestBody = true;
      return;
    }

    if (!inRequestBody) {
      return;
    }

    if (/^\s{6}responses:\s*$/.test(line)) {
      inRequestBody = false;
      inProperties = false;
      currentProperty = null;
      return;
    }

    if (/^\s{14}properties:\s*$/.test(line)) {
      inProperties = true;
      return;
    }

    if (!inProperties) {
      return;
    }

    const propMatch = line.match(/^\s{16}([A-Za-z0-9_]+):\s*$/);
    if (propMatch) {
      currentProperty = propMatch[1];
      body[currentProperty] = "string";
      return;
    }

    if (currentProperty) {
      const typeMatch = line.match(/^\s{18}type:\s+(.+)\s*$/);
      if (typeMatch) {
        const rawType = typeMatch[1].trim();
        if (rawType === "integer" || rawType === "number") {
          body[currentProperty] = 0;
        } else if (rawType === "boolean") {
          body[currentProperty] = true;
        } else if (rawType === "array") {
          body[currentProperty] = [];
        } else {
          body[currentProperty] = "string";
        }
      }
    }
  });

  return Object.keys(body).length > 0 ? body : null;
}

function fallbackOperationId(method, apiPath) {
  const suffix = apiPath
    .replace(/^\/+/, "")
    .replace(/\{([^}]+)\}/g, "$1")
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "");
  return `${method.toLowerCase()}${suffix ? suffix.charAt(0).toUpperCase() + suffix.slice(1) : "Root"}`;
}

function getOpenApiDetail(apiPath) {
  const { openapiSwaggerDir, swaggerDir, embedded } = getSwaggerContext();
  const blocks = collectPathBlocks(swaggerDir);
  const block = blocks.find((item) => item.path === apiPath);

  if (!block) {
    return null;
  }

  const methods = extractMethods(block.blockLines);
  const method = methods[0] || "";

  return {
    path: block.path,
    method,
    file: embedded ? block.filePath : path.relative(openapiSwaggerDir, block.filePath),
    operationId: extractScalar(block.blockLines, /^\s{6}operationId:\s+/) || fallbackOperationId(method, block.path),
    summary: extractScalar(block.blockLines, /^\s{6}summary:\s+/),
    description: extractScalar(block.blockLines, /^\s{6}description:\s+/),
    tags: extractTags(block.blockLines),
    parameters: extractParameters(block.blockLines),
    servers: extractServers(block.fileLines),
    requestBodyTemplate: buildRequestBodyTemplate(block.blockLines),
    sourceRoot: swaggerDir,
  };
}

module.exports = {
  collectPathBlocks,
  extractTags,
  extractMethods,
  extractScalar,
  getOpenApiDetail,
  getSwaggerContext,
};
