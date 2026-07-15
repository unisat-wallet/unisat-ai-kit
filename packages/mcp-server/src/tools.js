const z = require("zod/v4");

const SERVER_VERSION = "0.1.0";

function loadCliExports() {
  try {
    return require("@unisat/ai-cli");
  } catch (error) {
    return require("../../cli");
  }
}

const cliExports = loadCliExports();
const {
  callApi,
  getConfiguredValue,
  getDotEnvPath,
  getSwaggerContext,
  introResolve,
  introShow,
  listOpenApiEnvironments,
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

function hasApiKey(environment) {
  if (typeof getConfiguredValue !== "function") {
    return false;
  }
  return Boolean(getConfiguredValue(environment.apiKeyEnv));
}

const resolveApiSchema = z
  .object({
    query: z.string().describe("Natural-language task to resolve.").optional(),
    path: z.string().describe("Exact OpenAPI path to resolve directly.").optional(),
    shell: z.enum(["powershell", "bash"]).describe("Shell style for generated example commands.").optional(),
    environment: z.enum(["bitcoin", "fractal"]).describe("OpenAPI environment.").optional(),
    top: z.number().int().min(0).max(10).describe("Number of alternatives to include.").optional(),
  })
  .strict();

const showApiSchema = z
  .object({
    path: z.string().describe("Exact OpenAPI path, for example /v1/indexer/brc20/status."),
  })
  .strict();

const getStatusSchema = z.object({}).strict();

const listEnvironmentsSchema = z.object({}).strict();

const keyValueMapSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number(), z.boolean()]))]));
const keyValueInputSchema = z.union([z.array(z.string()), keyValueMapSchema]);

const callApiSchema = z
  .object({
    path: z.string().describe("Exact UniSat OpenAPI path to call."),
    environment: z.enum(["bitcoin", "fractal"]).describe("OpenAPI environment.").optional(),
    apiKey: z.string().describe("Optional API key. Prefer environment config for normal use.").optional(),
    apiKeySource: z.string().describe("Optional label for where apiKey came from.").optional(),
    query: z.string().describe("Query parameters as URL query string, for example address=...&cursor=0.").optional(),
    queryParams: keyValueInputSchema
      .describe("Query parameters as key=value entries or a JSON object. Prefer this field for MCP calls, for example [\"address=...\", \"cursor=0\"] or {\"address\": \"...\"}.")
      .optional(),
    pathParams: z.string().describe("Path parameters as URL query string, for example address=...&ticker=ordi.").optional(),
    pathParamEntries: keyValueInputSchema
      .describe("Path parameters as key=value entries or a JSON object. Prefer this field for MCP calls, for example [\"address=...\"] or {\"address\": \"...\"}.")
      .optional(),
    body: z.string().describe("JSON request body string for POST/PUT style APIs.").optional(),
    confirm: z
      .boolean()
      .describe("Required as true for non-GET API calls after the user explicitly confirms the operation.")
      .optional(),
  })
  .strict();

const toolDefinitions = [
  {
    name: "get_status",
    title: "Get Server Status",
    description: "Return UniSat AI MCP server, Node.js, CLI capability, swagger source, and tool status.",
    inputSchema: getStatusSchema,
    handler() {
      const payload = {
        command: "mcp.get_status",
        mode: "detail",
        server: {
          name: "unisat-ai-mcp-server",
          version: SERVER_VERSION,
        },
        node: {
          version: process.version,
          platform: process.platform,
          arch: process.arch,
        },
        cli: {
          loaded: Boolean(introResolve && introShow && callApi),
          capabilities: {
            introResolve: typeof introResolve === "function",
            introShow: typeof introShow === "function",
            callApi: typeof callApi === "function",
            listOpenApiEnvironments: typeof listOpenApiEnvironments === "function",
          },
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
    name: "list_environments",
    title: "List OpenAPI Environments",
    description: "List supported UniSat OpenAPI environments, base URLs, API key environment names, and key configuration status.",
    inputSchema: listEnvironmentsSchema,
    handler() {
      const environments = typeof listOpenApiEnvironments === "function" ? listOpenApiEnvironments() : [];
      const payload = {
        command: "mcp.list_environments",
        mode: "detail",
        environments: environments.map((environment) => ({
          name: environment.name,
          label: environment.label,
          baseUrl: environment.baseUrl,
          apiKeyEnv: environment.apiKeyEnv,
          apiKeyConfigured: hasApiKey(environment),
        })),
      };
      return toToolResult(payload, environments.length === 0);
    },
  },
  {
    name: "resolve_api",
    title: "Resolve API Interface",
    description:
      "Resolve the best UniSat OpenAPI interface, parameters, and runnable CLI example from a natural-language task.",
    inputSchema: resolveApiSchema,
    handler(args) {
      const payload = introResolve({
        query: args.query,
        apiPath: args.path,
        shell: args.shell || "powershell",
        environment: args.environment || "bitcoin",
        top: args.top ?? 5,
      });
      return toToolResult(payload, payload.mode === "not_found" || payload.mode === "missing_input");
    },
  },
  {
    name: "show_api",
    title: "Show API Interface",
    description: "Show raw OpenAPI detail for a known UniSat interface path.",
    inputSchema: showApiSchema,
    handler(args) {
      const payload = introShow(args.path);
      return toToolResult(payload, payload.mode === "not_found");
    },
  },
  {
    name: "call_api",
    title: "Call OpenAPI Interface",
    description: "Call a UniSat OpenAPI interface through the CLI capability layer. Non-GET calls require explicit user confirmation.",
    inputSchema: callApiSchema,
    async handler(args) {
      const detail = typeof introShow === "function" ? introShow(args.path) : null;
      if (!detail || detail.mode === "not_found") {
        return toToolResult(
          {
            command: "api.call",
            mode: "not_found",
            path: args.path,
          },
          true
        );
      }
      const method = String(detail.method || "").toUpperCase();
      if (method !== "GET" && args.confirm !== true) {
        return toToolResult(
          {
            command: "api.call",
            mode: "confirmation_required",
            path: args.path,
            method: detail.method,
            summary: detail.summary,
            message: "This API call may have side effects. Ask the user to confirm before retrying with confirm=true.",
            confirmation: {
              required: true,
              retryWith: {
                confirm: true,
              },
            },
          },
          true
        );
      }
      const environment = args.environment || "bitcoin";
      const apiKey = args.apiKey || (typeof getConfiguredValue === "function" ? getConfiguredValue(environment === "fractal" ? "UNISAT_FRACTAL_API_KEY" : "UNISAT_BITCOIN_API_KEY") : "");
      const payload = await callApi({
        apiPath: args.path,
        apiKey,
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
