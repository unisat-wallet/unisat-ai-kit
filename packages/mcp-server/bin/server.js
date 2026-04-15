#!/usr/bin/env node

const { callTool, getToolDefinitions } = require("../src/tools");

const SERVER_INFO = {
  name: "unisat-ai-mcp-server",
  title: "UniSat AI MCP Server",
  version: "0.1.0",
};

const SUPPORTED_PROTOCOL_VERSION = "2025-06-18";

let initialized = false;
let buffer = Buffer.alloc(0);

function writeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function sendResult(id, result) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    result,
  });
}

function sendError(id, code, message, data) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data ? { data } : {}),
    },
  });
}

function handleInitialize(id, params) {
  const requestedVersion = params && params.protocolVersion;
  const protocolVersion =
    requestedVersion === SUPPORTED_PROTOCOL_VERSION
      ? requestedVersion
      : SUPPORTED_PROTOCOL_VERSION;

  sendResult(id, {
    protocolVersion,
    capabilities: {
      tools: {
        listChanged: false,
      },
    },
    serverInfo: SERVER_INFO,
    instructions:
      "UniSat AI MCP server exposes read-only developer assistant tools backed by local docs, swagger, and error indexes.",
  });
}

function handleRequest(message) {
  const { id, method, params } = message;

  if (method === "initialize") {
    handleInitialize(id, params);
    return;
  }

  if (method === "notifications/initialized") {
    initialized = true;
    return;
  }

  if (method === "ping") {
    sendResult(id, {});
    return;
  }

  if (!initialized) {
    sendError(id, -32002, "Server not initialized");
    return;
  }

  if (method === "tools/list") {
    sendResult(id, {
      tools: getToolDefinitions(),
    });
    return;
  }

  if (method === "tools/call") {
    try {
      const result = callTool(params.name, params.arguments || {});
      sendResult(id, result);
    } catch (error) {
      sendError(id, -32602, error.message);
    }
    return;
  }

  sendError(id, -32601, `Method not found: ${method}`);
}

function processBuffer() {
  while (true) {
    const delimiterIndex = buffer.indexOf("\r\n\r\n");
    if (delimiterIndex === -1) {
      return;
    }

    const headerText = buffer.slice(0, delimiterIndex).toString("utf8");
    const lengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
    if (!lengthMatch) {
      buffer = Buffer.alloc(0);
      return;
    }

    const contentLength = Number.parseInt(lengthMatch[1], 10);
    const messageStart = delimiterIndex + 4;
    const messageEnd = messageStart + contentLength;
    if (buffer.length < messageEnd) {
      return;
    }

    const body = buffer.slice(messageStart, messageEnd).toString("utf8");
    buffer = buffer.slice(messageEnd);

    try {
      const message = JSON.parse(body);
      handleRequest(message);
    } catch (error) {
      sendError(null, -32700, `Parse error: ${error.message}`);
    }
  }
}

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  processBuffer();
});

process.stdin.on("end", () => {
  process.exit(0);
});
