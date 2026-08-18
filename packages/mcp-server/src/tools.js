const z = require("zod/v4");
const { version: SERVER_VERSION } = require("../package.json");

function loadCliExports() {
  try {
    return require("@unisat/openapi-cli");
  } catch (error) {
    return require("../../cli");
  }
}

const cliExports = loadCliExports();
const {
  callApi,
  getConfiguredValue,
  getDotEnvPath,
  getOpenApiDetail,
  getSwaggerContext,
} = cliExports;

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

function getToolNames() {
  return toolDefinitions.map((tool) => tool.name);
}

function getSwaggerStatus() {
  if (typeof getSwaggerContext !== "function") {
    return {
      available: false,
      source: "unknown",
    };
  }

  const context = getSwaggerContext();
  return {
    available: true,
    source: context.embedded ? "embedded" : "filesystem",
    path: context.swaggerDir,
  };
}

const keyValueMapSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number(), z.boolean()]))]));
const keyValueInputSchema = z.union([z.array(z.string()), keyValueMapSchema]);
const getStatusSchema = z.object({}).strict();
const callApiSchema = z
  .object({
    path: z.string().describe("Exact OpenAPI path."),
    environment: z.enum(["bitcoin", "fractal"]).optional(),
    apiKey: z.string().optional(),
    apiKeySource: z.string().optional(),
    query: z.string().optional(),
    queryParams: keyValueInputSchema.optional(),
    pathParams: z.string().optional(),
    pathParamEntries: keyValueInputSchema.optional(),
    body: z.string().optional(),
    confirm: z.boolean().optional(),
  })
  .strict();

function configuredApiKey(environment) {
  if (typeof getConfiguredValue !== "function") return "";
  return getConfiguredValue(environment === "fractal" ? "UNISAT_FRACTAL_API_KEY" : "UNISAT_BITCOIN_API_KEY");
}

function operationRequiresConfirmation(detail) {
  const metadataValue = detail?.unisat?.["x-unisat-requires-confirmation"];
  if (typeof metadataValue === "boolean") {
    return metadataValue;
  }
  return String(detail?.method || "").toUpperCase() !== "GET";
}

const toolDefinitions = [
  {
    name: "get_status",
    title: "Get Server Status",
    description: "Return UniSat AI Kit MCP server status.",
    inputSchema: getStatusSchema,
    handler() {
      const payload = {
        command: "mcp.get_status",
        mode: "detail",
        server: {
          name: "unisat-openapi-mcp",
          version: SERVER_VERSION,
        },
        node: {
          version: process.version,
          platform: process.platform,
          arch: process.arch,
        },
        cli: {
          loaded: typeof callApi === "function",
        },
        swagger: getSwaggerStatus(),
        config: {
          envFile: typeof getDotEnvPath === "function" ? getDotEnvPath() : undefined,
        },
        tools: getToolNames(),
      };
      return toToolResult(payload, !payload.cli.loaded || !payload.swagger.available);
    },
  },
  {
    name: "call_api",
    title: "Call OpenAPI Interface",
    description: "Call an exact UniSat OpenAPI path.",
    inputSchema: callApiSchema,
    async handler(args) {
      const detail = typeof getOpenApiDetail === "function" ? getOpenApiDetail(args.path) : null;
      if (!detail) {
        return toToolResult(
          {
            command: "api.call",
            mode: "not_found",
            path: args.path,
          },
          true
        );
      }

      const requiresConfirmation = operationRequiresConfirmation(detail);
      if (requiresConfirmation && args.confirm !== true) {
        return toToolResult(
          {
            command: "api.call",
            mode: "confirmation_required",
            path: args.path,
            method: detail.method,
            summary: detail.summary,
            unisat: detail.unisat,
            safety: {
              readOnly: detail.unisat?.["x-unisat-readonly"] === true,
              requiresConfirmation,
            },
          },
          true
        );
      }

      const environment = args.environment || "bitcoin";
      const payload = await callApi({
        apiPath: args.path,
        apiKey: args.apiKey || configuredApiKey(environment),
        apiKeySource: args.apiKey ? args.apiKeySource || "mcp_argument" : "configured_environment",
        environment,
        query: args.query,
        queryParamsList: args.queryParams,
        pathParams: args.pathParams,
        pathParamsList: args.pathParamEntries,
        body: args.body,
        clientSource: "mcp",
      });
      return toToolResult(payload, payload.mode !== "detail");
    },
  },
];

function registerTools(server) {
  toolDefinitions.forEach((tool) => {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (args) => tool.handler(args || {})
    );
  });
}

module.exports = {
  registerTools,
  toToolResult,
};
