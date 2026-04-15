const path = require("path");
const { getSourceRoots } = require("./repo-paths");
const { walkFiles, readUtf8 } = require("./file-utils");

function getSwaggerContext() {
  const { openapiSwaggerDir } = getSourceRoots();
  return {
    openapiSwaggerDir,
    swaggerDir: path.join(openapiSwaggerDir, "project", "open-api", "swagger"),
  };
}

function collectPathBlocks(swaggerDir) {
  const files = walkFiles(swaggerDir, (filePath) => filePath.endsWith(".yaml")).sort();
  const blocks = [];

  files.forEach((filePath) => {
    const content = readUtf8(filePath);
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
    return value.replace(/^['"]|['"]$/g, "");
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

function extractParameters(lines) {
  const parameters = [];
  let current = null;
  let inParameters = false;
  let inSchema = false;

  lines.forEach((line) => {
    if (/^\s{6}parameters:\s*$/.test(line)) {
      inParameters = true;
      return;
    }

    if (!inParameters) {
      return;
    }

    if (/^\s{8}-\s+name:\s+/.test(line)) {
      if (current) {
        parameters.push(current);
      }
      current = {
        name: line.replace(/^\s{8}-\s+name:\s+/, "").trim(),
        in: "",
        required: false,
        description: "",
        type: "",
      };
      inSchema = false;
      return;
    }

    if (!current) {
      if (!/^\s{8}/.test(line) || /^\s{6}(responses|requestBody):\s*$/.test(line)) {
        inParameters = false;
      }
      return;
    }

    if (/^\s{10}schema:\s*$/.test(line)) {
      inSchema = true;
      return;
    }

    if (/^\s{10}(in|required|description):\s+/.test(line)) {
      const [, key] = line.match(/^\s{10}(in|required|description):\s+/);
      const value = line.replace(/^\s{10}(in|required|description):\s+/, "").trim();
      if (key === "required") {
        current.required = value === "true";
      } else {
        current[key] = value.replace(/^['"]|['"]$/g, "");
      }
      inSchema = false;
      return;
    }

    if (inSchema && /^\s{12}type:\s+/.test(line)) {
      current.type = line.replace(/^\s{12}type:\s+/, "").trim();
      return;
    }

    if (/^\s{6}(responses|requestBody):\s*$/.test(line) || !/^\s{10,12}/.test(line)) {
      parameters.push(current);
      current = null;
      inSchema = false;
      inParameters = false;
    }
  });

  if (current) {
    parameters.push(current);
  }

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
      servers.push(match[1].trim().replace(/^['"]|['"]$/g, ""));
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

function getOpenApiDetail(apiPath) {
  const { openapiSwaggerDir, swaggerDir } = getSwaggerContext();
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
    file: path.relative(openapiSwaggerDir, block.filePath),
    operationId: extractScalar(block.blockLines, /^\s{6}operationId:\s+/),
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
  extractMethods,
  extractScalar,
  getOpenApiDetail,
  getSwaggerContext,
};
