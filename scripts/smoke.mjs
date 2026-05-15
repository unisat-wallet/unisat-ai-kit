import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runCommand(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", args, {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`command failed (${args.join(" ")}): ${stderr || stdout}`));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sendMessage(stdin, message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  stdin.write(body);
}

async function runMcpSmoke() {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["packages/mcp-server/bin/server.js"], {
      cwd: rootDir,
      stdio: ["pipe", "pipe", "inherit"],
    });

    let buffer = Buffer.alloc(0);
    const responses = [];

    function parseMessages() {
      while (true) {
        const delimiterIndex = buffer.indexOf("\r\n\r\n");
        if (delimiterIndex === -1) {
          return;
        }

        const headerText = buffer.slice(0, delimiterIndex).toString("utf8");
        const lengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
        if (!lengthMatch) {
          reject(new Error("mcp smoke failed: missing Content-Length"));
          child.kill();
          return;
        }

        const length = Number.parseInt(lengthMatch[1], 10);
        const bodyStart = delimiterIndex + 4;
        const bodyEnd = bodyStart + length;
        if (buffer.length < bodyEnd) {
          return;
        }

        const body = buffer.slice(bodyStart, bodyEnd).toString("utf8");
        buffer = buffer.slice(bodyEnd);
        responses.push(JSON.parse(body));
      }
    }

    child.stdout.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      parseMessages();
    });

    child.on("error", reject);

    sendMessage(child.stdin, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: {
          name: "smoke",
          version: "0.1.0",
        },
      },
    });

    setTimeout(() => {
      sendMessage(child.stdin, {
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      });
      sendMessage(child.stdin, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      });
      sendMessage(child.stdin, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "generate_snippet",
          arguments: {
            path: "/v1/indexer/brc20/status",
            language: "curl",
          },
        },
      });
    }, 100);

    setTimeout(() => {
      try {
        const initResponse = responses.find((item) => item.id === 1);
        const listResponse = responses.find((item) => item.id === 2);
        const callResponse = responses.find((item) => item.id === 3);

        assert(initResponse?.result?.protocolVersion === "2025-06-18", "initialize response invalid");
        assert(Array.isArray(listResponse?.result?.tools), "tools/list response invalid");
        assert(
          listResponse.result.tools.some((item) => item.name === "generate_snippet"),
          "generate_snippet tool missing"
        );
        assert(
          callResponse?.result?.structuredContent?.command === "snippet.generate",
          "tools/call generate_snippet invalid"
        );

        child.kill();
        resolve();
      } catch (error) {
        child.kill();
        reject(error);
      }
    }, 600);
  });
}

async function main() {
  const cliChecks = [
    {
      name: "cli docs search",
      args: ["packages/cli/bin/unisat-ai.js", "docs", "search", "--query", "api key", "--limit", "1", "--format", "json"],
      validate(stdout) {
        const payload = JSON.parse(stdout);
        assert(payload.command === "docs.search", "docs search payload invalid");
        assert(Array.isArray(payload.results), "docs search results invalid");
      },
    },
    {
      name: "cli openapi explain",
      args: ["packages/cli/bin/unisat-ai.js", "openapi", "explain", "--path", "/v1/indexer/brc20/status", "--format", "json"],
      validate(stdout) {
        const payload = JSON.parse(stdout);
        assert(payload.command === "openapi.explain", "openapi explain payload invalid");
        assert(payload.path === "/v1/indexer/brc20/status", "openapi explain path invalid");
      },
    },
    {
      name: "cli error explain",
      args: ["packages/cli/bin/unisat-ai.js", "error", "explain", "--code", "-154", "--format", "json"],
      validate(stdout) {
        const payload = JSON.parse(stdout);
        assert(payload.command === "error.explain", "error explain payload invalid");
        assert(payload.error?.key === "indexer_timeout", "error explain result invalid");
      },
    },
    {
      name: "cli snippet generate",
      args: ["packages/cli/bin/unisat-ai.js", "snippet", "generate", "--path", "/v1/indexer/brc20/status", "--language", "curl", "--format", "json"],
      validate(stdout) {
        const payload = JSON.parse(stdout);
        assert(payload.command === "snippet.generate", "snippet generate payload invalid");
        assert(typeof payload.snippet === "string" && payload.snippet.includes("curl --request GET"), "snippet output invalid");
      },
    },
    {
      name: "cli intro find address brc20 balance list",
      args: ["packages/cli/bin/unisat-ai.js", "intro", "find", "--query", "address brc20 balance list", "--format", "json"],
      validate(stdout) {
        const payload = JSON.parse(stdout);
        assert(payload.command === "intro.find", "intro find payload invalid");
        assert(
          payload.matches[0]?.path === "/v1/indexer/address/{address}/brc20/summary",
          "address brc20 balance list should prefer address brc20 summary"
        );
      },
    },
    {
      name: "cli intro find brc20-prog ticker info",
      args: ["packages/cli/bin/unisat-ai.js", "intro", "find", "--query", "brc20 prog ticker info", "--format", "json"],
      validate(stdout) {
        const payload = JSON.parse(stdout);
        assert(payload.command === "intro.find", "intro find payload invalid");
        assert(
          payload.matches[0]?.path === "/v1/indexer/brc20-prog/{ticker}/info",
          "brc20 prog ticker info should prefer brc20-prog ticker info"
        );
      },
    },
    {
      name: "cli intro find marketplace brc20 ticker history",
      args: ["packages/cli/bin/unisat-ai.js", "intro", "find", "--query", "marketplace brc20 ticker history", "--format", "json"],
      validate(stdout) {
        const payload = JSON.parse(stdout);
        assert(payload.command === "intro.find", "intro find payload invalid");
        assert(
          payload.matches[0]?.path === "/v3/market/brc20/auction/brc20_kline",
          "marketplace brc20 ticker history should prefer brc20 kline"
        );
      },
    },
  ];

  for (const check of cliChecks) {
    const { stdout } = await runCommand(check.args);
    check.validate(stdout);
    console.log(`ok ${check.name}`);
  }

  await runMcpSmoke();
  console.log("ok mcp server");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
