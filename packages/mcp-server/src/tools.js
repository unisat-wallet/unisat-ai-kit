function loadCliExports() {
  try {
    return require("@unisat/ai-cli");
  } catch (error) {
    return require("../../cli");
  }
}

const { introResolve, introShow } = loadCliExports();

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
    name: "resolve_api",
    title: "Resolve API Interface",
    description: "Resolve the best UniSat OpenAPI interface, parameters, and runnable CLI example from a natural-language task.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural-language task to resolve.",
        },
        path: {
          type: "string",
          description: "Exact OpenAPI path to resolve directly.",
        },
        shell: {
          type: "string",
          description: "Shell style for generated example commands.",
          enum: ["powershell", "bash"],
        },
        environment: {
          type: "string",
          description: "OpenAPI environment. Supported values: bitcoin, fractal.",
          enum: ["bitcoin", "fractal"],
        },
        top: {
          type: "integer",
          description: "Number of alternatives to include.",
          minimum: 0,
          maximum: 10,
        },
      },
      additionalProperties: false,
    },
    handler(args) {
      const payload = introResolve({
        query: args.query,
        apiPath: args.path,
        shell: args.shell || "powershell",
        environment: args.environment || "bitcoin",
        top: args.top || 5,
      });
      return toToolResult(payload, payload.mode === "not_found" || payload.mode === "missing_input");
    },
  },
  {
    name: "show_api",
    title: "Show API Interface",
    description: "Show raw OpenAPI detail for a known UniSat interface path.",
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
      const payload = introShow(args.path);
      return toToolResult(payload, payload.mode === "not_found");
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
