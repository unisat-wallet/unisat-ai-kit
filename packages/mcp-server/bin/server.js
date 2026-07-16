#!/usr/bin/env node

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { registerTools } = require("../src/tools");

const SERVER_INFO = {
  name: "unisat-openapi-mcp",
  title: "UniSat AI Kit MCP Server",
  version: "0.1.0",
};

async function main() {
  const server = new McpServer(SERVER_INFO, {
    instructions:
      "UniSat AI Kit MCP server exposes UniSat OpenAPI discovery and call tools backed by local swagger data. Non-GET calls require explicit user confirmation.",
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(`UniSat AI Kit MCP server failed: ${error.message}`);
  process.exit(1);
});
