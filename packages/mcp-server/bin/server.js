#!/usr/bin/env node

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { registerTools } = require("../src/tools");
const { version } = require("../package.json");

function loadCliExports() {
  try {
    return require("@unisat/openapi-cli");
  } catch (_error) {
    return require("../../cli");
  }
}

const SERVER_INFO = {
  name: "unisat-openapi-mcp",
  title: "UniSat AI Kit MCP Server",
  version,
};

async function main() {
  const { ensureSwaggerCache, setSwaggerRuntimeDir } = loadCliExports();
  const swaggerStatus = await ensureSwaggerCache();
  if (typeof setSwaggerRuntimeDir === "function") {
    setSwaggerRuntimeDir(swaggerStatus.swaggerDir);
  }
  if (swaggerStatus.warning) {
    console.error(`warning: using cached Swagger: ${swaggerStatus.warning}`);
  }
  const server = new McpServer(SERVER_INFO, {
    instructions:
      "UniSat AI Kit MCP server exposes UniSat OpenAPI discovery and call tools backed by a validated local Swagger cache. Non-GET calls require explicit user confirmation.",
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(`UniSat AI Kit MCP server failed: ${error.message}`);
  process.exit(1);
});
