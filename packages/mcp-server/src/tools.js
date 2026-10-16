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
  getSwaggerContext,
  listOperationCommands,
  getOperationCommand,
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
    path: z.string().describe("Exact OpenAPI path. Response numbers outside safe integer range or losing decimal precision are exact strings; use BigInt/decimal arithmetic, not Number."),
    environment: z.enum(["bitcoin", "fractal"]).optional(),
    apiKey: z.string().optional(),
    apiKeySource: z.string().optional(),
    query: z.string().optional(),
    queryParams: keyValueInputSchema.optional(),
    pathParams: z.string().optional(),
    pathParamEntries: keyValueInputSchema.optional(),
    body: z.string().describe("JSON text, sent unchanged after validation. Preserve exact numeric literals; do not round large amounts through Number before encoding.").optional(),
    confirm: z.boolean().optional(),
  })
  .strict();

function configuredApiKey(environment) {
  if (typeof getConfiguredValue !== "function") return "";
  return getConfiguredValue(environment === "fractal" ? "UNISAT_FRACTAL_API_KEY" : "UNISAT_BITCOIN_API_KEY");
}

const toolDefinitions = [
  {
    name: "list_operations",
    title: "Discover OpenAPI Operations",
    description: "Discover UniSat blockchain, address assets, inscriptions, BRC20 and marketplace operations locally without an API key. Returns a compact bounded list and business domains; domain is not network. Search first, then get_operation for parameters and safety. Select bitcoin/fractal only when calling an API.",
    inputSchema: z.object({
      query: z.string().optional(),
      domain: z.string().optional(),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(50).default(20),
    }).strict(),
    handler({ query = "", domain, offset = 0, limit = 20 }) {
      const all = listOperationCommands();
      const domains = [...new Set(all.map((op) => op.domain))].sort();
      const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
      const matches = all.filter((op) => (!domain || op.domain === domain)
        && words.every((word) => `${op.commandName} ${op.path} ${op.summary} ${op.domain}`.toLowerCase().includes(word)));
      const operations = matches.slice(offset, offset + limit).map(({ commandName, path, method, summary, domain, readOnly, requiresConfirmation }) => ({ commandName, path, method, summary, domain, readOnly, requiresConfirmation }));
      return toToolResult({ mode: "list", domains, total: matches.length, offset, operations,
        nextOffset: offset + operations.length < matches.length ? offset + operations.length : null,
        nextAction: matches.length ? "Use get_operation with a commandName or exact path before call_api." : "Relax query or choose a listed business domain; bitcoin is an environment, not a domain." });
    },
  },
  {
    name: "get_operation",
    title: "Get Operation Parameters and Safety",
    description: "Inspect an operation found by list_operations: exact path, parameters, JSON body definitions, network metadata and confirmation requirements. Does not perform a network request. Read-only queries still require a configured key; never infer transfer safety from a successful query.",
    inputSchema: z.object({ operation: z.string().describe("Command name or exact API path from list_operations.") }).strict(),
    handler({ operation }) {
      const detail = getOperationCommand(operation) || listOperationCommands().find((op) => op.path === operation);
      return detail ? toToolResult({ mode: "detail", operation: detail })
        : toToolResult({ mode: "not_found", nextAction: "Use list_operations to discover a command name or exact path." }, true);
    },
  },
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
    description: "Call an exact UniSat OpenAPI path discovered with list_operations and inspected with get_operation. Use /openapi/public/get_credits to query the current API key's quota, usage, and expireTime (Unix seconds; 0 means no expiration, not unlimited quota); environment selects the configured Bitcoin or Fractal key. Only supply confirm after explicit user authorization of that write operation; it is not an error recovery flag.",
    inputSchema: callApiSchema,
    async handler(args) {
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
        confirm: args.confirm === true,
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
