import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAppSource } from "./package-single-cli.mjs";
import { runPrecisionChecks } from "./precision-checks.mjs";

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { callApi } = require("../packages/cli/src/api-call");
const { registerTools } = require("../packages/mcp-server/src/tools");
const { version } = require("../packages/cli/package.json");
const { getOperationCommand } = require("../packages/cli/src/operation-commands");

function runNode(source) {
  const result = spawnSync(process.execPath, ["-"], {
    cwd: rootDir, input: source, encoding: "utf8", timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  return result;
}

export async function runRegressionChecks() {
  await runPrecisionChecks();
  // Execute the actual generated bundle to verify JSON module exports too.
  const bundle = runNode(`process.argv = ['node', 'bundle', '--version'];\n${buildAppSource()}`);
  assert.equal(bundle.status, 0, bundle.stderr);
  assert.equal(bundle.stdout.trim(), version);

  const originalFetch = globalThis.fetch;
  const handlers = {};
  registerTools({ registerTool(name, metadata, handler) { handlers[name] = handler; } });
  await checkCredits(handlers);
  const base = { apiPath: "/v1/indexer/blockchain/info", apiKey: "regression_fake" };
  try {
    let requests = 0;
    globalThis.fetch = async (url) => {
      requests += 1;
      const parsed = new URL(url);
      assert.equal(parsed.searchParams.get("address"), "test-address");
      assert.equal(parsed.searchParams.get("tick"), "test-tick");
      return Response.json({ code: 0, data: {} });
    };
    for (const dryRun of [false, true]) {
      const missing = await callApi({ ...base, apiPath: "/v1/brc20-swap/balance", dryRun });
      assert.equal(missing.mode, "missing_query_params");
      assert.deepEqual(missing.missingQueryParams, ["address", "tick"]);
    }
    const mcpMissing = await handlers.call_api({ path: "/v1/brc20-swap/balance", apiKey: "fake" });
    assert.equal(mcpMissing.isError, true);
    assert.equal(mcpMissing.structuredContent.mode, "missing_query_params");
    assert.equal(requests, 0, "Missing parameters must never issue a request");
    const supplied = await callApi({
      ...base, apiPath: "/v1/brc20-swap/balance",
      queryParamsList: { ADDRESS: "test-address", tick: "test-tick" },
    });
    assert.equal(supplied.mode, "detail");
    assert.equal(requests, 1);

    for (const [status, body, mode] of [
      [200, { code: 0, data: {} }, "detail"],
      [200, { code: "0", data: {} }, "detail"],
      [200, { data: {} }, "detail"],
      [200, { code: "FST_ERR_VALIDATION", msg: '"filter" is required', data: null }, "api_error"],
      [200, { code: "1001", msg: "rejected" }, "api_error"],
      [200, { code: -1, msg: "rejected" }, "api_error"],
      [200, { code: 1001, msg: "rejected" }, "api_error"],
      [503, { code: -1, msg: "unavailable" }, "http_error"],
      [401, { code: -1, msg: "unauthorized" }, "api_key_error"],
    ]) {
      globalThis.fetch = async () => Response.json(body, { status });
      const result = await callApi(base);
      assert.equal(result.mode, mode);
      assert.equal(result.response.ok, mode === "detail");
      assert.equal(result.response.httpOk, status >= 200 && status < 300);
      assert.deepEqual(result.response.body, body);
      const mcpResult = await handlers.call_api({ path: base.apiPath, apiKey: base.apiKey });
      assert.equal(mcpResult.isError, mode !== "detail");
      for (const command of [["api", "call", "--path", base.apiPath], ["getBlockchainInfo"]]) {
        const args = [...command, "--api-key", base.apiKey, "--format", "json"];
        const cli = runNode(`
          global.fetch = async () => Response.json(${JSON.stringify(body)}, {status: ${status}});
          process.argv = ['node', 'cli', ...${JSON.stringify(args)}];
          require('./packages/cli/bin/unisat-ai.js');
        `);
        assert.equal(cli.status, mode === "detail" ? 0 : 1, cli.stderr || cli.stdout);
        assert.equal(JSON.parse(cli.stdout).mode, mode);
      }
    }

    for (const [apiPath, expectedMode] of [
      ["/not-found", "not_found"],
      ["/v1/indexer/address/{address}/balance", "missing_path_params"],
      ["/v1/brc20-swap/balance", "missing_query_params"],
      [base.apiPath, "plan"],
    ]) {
      const cli = runNode(`
        global.fetch = async () => { throw new Error('Unexpected request'); };
        process.argv = ['node', 'cli', 'api', 'call', '--path', ${JSON.stringify(apiPath)}, '--dry-run', '--format', 'json'];
        require('./packages/cli/bin/unisat-ai.js');
      `);
      assert.equal(cli.status, expectedMode === "plan" ? 0 : 1, cli.stderr || cli.stdout);
      assert.equal(JSON.parse(cli.stdout).mode, expectedMode);
      if (expectedMode === "missing_path_params" || expectedMode === "missing_query_params") {
        const textCli = runNode(`
          global.fetch = async () => { throw new Error('Unexpected request'); };
          process.argv = ['node', 'cli', 'api', 'call', '--path', ${JSON.stringify(apiPath)}];
          require('./packages/cli/bin/unisat-ai.js');
        `);
        assert.equal(textCli.status, 1);
        assert.match(textCli.stderr, /Missing required (path|query) parameter/);
        assert.doesNotMatch(textCli.stderr, /TypeError|toUpperCase/);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function checkCredits(handlers) {
  const apiPath = "/openapi/public/get_credits";
  const url = `https://developer.unisat.io${apiPath}`;
  const data = {
    reqPerDay: 10000, reqPerMonth: 200000, qpsQuota: 10, cumulReqQuota: 300000,
    reqQuota: 250000, creditsToday: 200, creditsYesterday: 300,
    creditsThisMonth: 5000, creditsLastMonth: 7000, expireTime: 1800000000,
  };
  const operation = getOperationCommand("getCredits");
  assert.equal(operation.path, apiPath);
  assert.equal(operation.requiresConfirmation, false);
  assert.equal(operation.file, "builtin:credits");
  for (const args of [["--help"], ["getCredits", "--help"]]) {
    const help = runNode(`process.argv = ['node', 'cli', ...${JSON.stringify(args)}]; require('./packages/cli/bin/unisat-ai.js');`);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /getCredits/);
    assert.match(help.stdout, /expireTime/);
  }
  const standalone = runNode(`
    process.env.OPENAPI_SWAGGER_DIR = './__missing_swagger__';
    process.argv = ['node', 'cli', 'getCredits', '--dry-run', '--format', 'json'];
    require('./packages/cli/bin/unisat-ai.js');
  `);
  assert.equal(standalone.status, 0, standalone.stderr);
  assert.equal(JSON.parse(standalone.stdout).request.url, url);
  const originalFetch = globalThis.fetch;
  const keyNames = ["UNISAT_BITCOIN_API_KEY", "UNISAT_FRACTAL_API_KEY", "UNISAT_AI_KIT_ENV_FILE"];
  const savedEnv = Object.fromEntries(keyNames.map(name => [name, process.env[name]]));
  try {
    process.env.UNISAT_BITCOIN_API_KEY = "fake_bitcoin_credits";
    process.env.UNISAT_FRACTAL_API_KEY = "fake_fractal_credits";
    for (const environment of ["bitcoin", "fractal"]) {
      for (const override of [false, true]) {
        const key = override ? "fake_override_credits" : `fake_${environment}_credits`;
        globalThis.fetch = async (actualUrl, options) => {
          assert.equal(actualUrl, url);
          assert.equal(options.method, "GET");
          assert.equal(options.headers.Authorization, `Bearer ${key}`);
          assert.equal(options.headers["X-Unisat-AI-Client"], "mcp");
          assert.equal(options.body, undefined);
          return Response.json({ code: 0, data });
        };
        const result = await handlers.call_api({ path: apiPath, environment, ...(override ? { apiKey: key } : {}) });
        assert.equal(result.isError, false);
        assert.deepEqual(result.structuredContent.response.body.data, data);
        assert.ok(!JSON.stringify(result).includes(key), "Do not expose the configured key");

        for (const command of [["getCredits"], ["api", "call", "--path", apiPath]]) {
          const args = [...command, "--env", environment, "--format", "json", ...(override ? ["--api-key", key] : [])];
          const cli = runNode(`
            const assert = require('node:assert/strict');
            process.env.UNISAT_BITCOIN_API_KEY = 'fake_bitcoin_credits';
            process.env.UNISAT_FRACTAL_API_KEY = 'fake_fractal_credits';
            global.fetch = async (url, options) => {
              assert.equal(url, ${JSON.stringify(url)});
              assert.equal(options.headers.Authorization, ${JSON.stringify(`Bearer ${key}`)});
              assert.equal(options.headers['X-Unisat-AI-Client'], 'cli');
              assert.equal(options.method, 'GET');
              return Response.json({code: 0, data: ${JSON.stringify(data)}});
            };
            process.argv = ['node', 'cli', ...${JSON.stringify(args)}];
            require('./packages/cli/bin/unisat-ai.js');
          `);
          assert.equal(cli.status, 0, cli.stderr || cli.stdout);
          assert.deepEqual(JSON.parse(cli.stdout).response.body.data, data);
          assert.ok(!cli.stdout.includes(key));
        }
      }
    }
    // The Go backend omits reqPerMonth when zero; do not invent a limit.
    const { reqPerMonth, ...withoutMonthlyLimit } = { ...data, expireTime: 0 };
    globalThis.fetch = async () => Response.json({ code: 0, data: withoutMonthlyLimit });
    const absentMonthly = await handlers.call_api({ path: apiPath });
    assert.deepEqual(absentMonthly.structuredContent.response.body.data, withoutMonthlyLimit);
    globalThis.fetch = async () => Response.json({ code: 100, msg: "key invalid" });
    const invalid = await handlers.call_api({ path: apiPath });
    assert.equal(invalid.isError, true);
    assert.equal(invalid.structuredContent.mode, "api_error");
    delete process.env.UNISAT_BITCOIN_API_KEY;
    process.env.UNISAT_AI_KIT_ENV_FILE = path.join(rootDir, "__credits_missing_config__", ".env");
    globalThis.fetch = async () => { throw new Error("Missing key must not send a request"); };
    const missing = await handlers.call_api({ path: apiPath });
    assert.equal(missing.isError, true);
    assert.equal(missing.structuredContent.mode, "missing_api_key");
    const plan = await callApi({ apiPath, environment: "fractal", dryRun: true });
    assert.equal(plan.mode, "plan");
    assert.equal(plan.url, url);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of keyNames) {
      if (savedEnv[name] === undefined) delete process.env[name];
      else process.env[name] = savedEnv[name];
    }
  }
}
