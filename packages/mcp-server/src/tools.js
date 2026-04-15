function loadCliExports() {
  try {
    return require("@unisat/ai-cli");
  } catch (error) {
    return require("../../cli");
  }
}

const {
  searchDocs,
  explainOpenApi,
  explainErrorByCode,
  explainErrorByQuery,
  generateSnippet,
} = loadCliExports();

function toToolResult(payload, isError = false) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
    isError,
  };
}

const tools = [
  {
    name: "search_docs",
    title: "Search Developer Docs",
    description: "Search UniSat developer markdown docs by keyword.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keyword or phrase to search in UniSat developer docs.",
        },
        limit: {
          type: "integer",
          description: "Max number of matches to return.",
          minimum: 1,
          maximum: 20,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler(args) {
      return toToolResult(searchDocs(args.query, args.limit || 5));
    },
  },
  {
    name: "find_openapi",
    title: "Find OpenAPI Paths",
    description: "Find matching UniSat OpenAPI paths by keyword.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description: "Keyword to search in OpenAPI paths.",
        },
      },
      required: ["keyword"],
      additionalProperties: false,
    },
    handler(args) {
      return toToolResult(explainOpenApi({ keyword: args.keyword }));
    },
  },
  {
    name: "explain_api",
    title: "Explain OpenAPI Operation",
    description: "Explain a UniSat OpenAPI operation by exact path.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Exact OpenAPI path, for example /v1/indexer/brc20/status.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    handler(args) {
      const payload = explainOpenApi({ apiPath: args.path });
      return toToolResult(payload, payload.mode === "not_found");
    },
  },
  {
    name: "generate_snippet",
    title: "Generate API Snippet",
    description: "Generate curl or TypeScript fetch example by exact OpenAPI path.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Exact OpenAPI path, for example /v1/indexer/brc20/status.",
        },
        language: {
          type: "string",
          description: "Snippet language. Supported values: curl, typescript.",
          enum: ["curl", "typescript"],
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    handler(args) {
      const payload = generateSnippet({
        apiPath: args.path,
        language: args.language || "curl",
      });
      return toToolResult(payload, payload.mode === "not_found");
    },
  },
  {
    name: "explain_error",
    title: "Explain Error Code",
    description: "Explain a UniSat error code or search known error messages.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "integer",
          description: "Exact negative error code.",
        },
        query: {
          type: "string",
          description: "Keyword to search in error keys and messages.",
        },
        limit: {
          type: "integer",
          description: "Max number of fuzzy matches to return.",
          minimum: 1,
          maximum: 20,
        },
      },
      additionalProperties: false,
    },
    handler(args) {
      if (typeof args.code === "number") {
        const payload = explainErrorByCode(args.code);
        return toToolResult(payload, !payload.found);
      }

      if (typeof args.query === "string" && args.query.trim()) {
        return toToolResult(explainErrorByQuery(args.query, args.limit || 5));
      }

      return toToolResult(
        {
          command: "error.explain",
          mode: "invalid_arguments",
          message: "explain_error requires code or query",
        },
        true
      );
    },
  },
];

function getToolDefinitions() {
  return tools.map(({ handler, ...tool }) => tool);
}

function callTool(name, args) {
  const tool = tools.find((item) => item.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  return tool.handler(args || {});
}

module.exports = {
  callTool,
  getToolDefinitions,
};
