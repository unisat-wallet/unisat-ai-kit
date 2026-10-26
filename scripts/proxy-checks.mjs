import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const proxyKeys = ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy"];

export async function withoutProxyEnvironment(run) {
  const saved = proxyKeys.map(key => [key, process.env[key]]);
  proxyKeys.forEach(key => delete process.env[key]);
  try { return await run(); }
  finally { for (const [key, value] of saved) value === undefined ? delete process.env[key] : process.env[key] = value; }
}

export async function runProxyChecks() {
  const env = { ...process.env, NODE_EXTRA_CA_CERTS: path.join(root, "tests/fixtures/proxy/cert.pem") };
  proxyKeys.forEach(key => delete env[key]);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--child"], { env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timer = setTimeout(() => { child.kill(); reject(Error("Proxy checks timed out")); }, 20000);
    child.stdout.on("data", data => output += data);
    child.stderr.on("data", data => output += data);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error(output)); });
  });
}

async function checks() {
  const { fetchWithProxy, proxyFor, bypassProxy, networkDiagnostic } = require("../packages/cli/src/http-transport");
  const { callApi } = require("../packages/cli/src/api-call");
  const { registerTools } = require("../packages/mcp-server/src/tools");
  const credentials = {
    cert: fs.readFileSync(path.join(root, "tests/fixtures/proxy/cert.pem")),
    key: fs.readFileSync(path.join(root, "tests/fixtures/proxy/key.pem")),
  };
  let hits = 0, tunnels = 0, forwardHits = 0;
  const bodies = [], headers = [], sockets = new Set();
  const handler = (req, res) => {
    hits++; headers.push(req.headers);
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: "/test" }); res.end(); return;
    }
    if (req.url === "/cross-origin") {
      res.writeHead(302, { Location: "https://developer.unisat.io/test" }); res.end(); return;
    }
    let body = "";
    req.on("data", data => body += data);
    req.on("end", () => { bodies.push(body); res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"code":0,"data":{"blocks":123,"amount":9007199254740993}}'); });
  };
  const target = https.createServer(credentials, handler);
  const plain = http.createServer(handler);
  const proxy = http.createServer((req, res) => {
    forwardHits++;
    const url = new URL(req.url);
    const upstream = http.request(url, { method: req.method, headers: { Host: url.host } }, response => {
      res.writeHead(response.statusCode, response.headers); response.pipe(res);
    });
    upstream.once("error", () => res.destroy());
    req.pipe(upstream);
  });
  let rejectConnect = false, stall = false;
  const onConnect = (req, socket, head) => {
    tunnels++;
    assert.equal(req.headers["proxy-authorization"], "Basic " + Buffer.from("user:private-proxy-password").toString("base64"));
    if (stall) return;
    if (rejectConnect) { socket.end("HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n"); return; }
    const upstream = net.connect(target.address().port, "127.0.0.1", () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      socket.pipe(upstream); upstream.pipe(socket);
    });
    sockets.add(upstream); upstream.once("close", () => sockets.delete(upstream));
    upstream.on("error", () => socket.destroy()); socket.on("error", () => upstream.destroy());
    socket.on("close", () => upstream.destroy());
  };
  proxy.on("connect", onConnect);
  const secureProxy = https.createServer(credentials);
  secureProxy.on("connect", onConnect);
  const servers = [target, plain, proxy, secureProxy];
  for (const server of servers) {
    server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  }
  const proxyUrl = `http://user:private-proxy-password@127.0.0.1:${proxy.address().port}`;
  const local = `https://localhost:${target.address().port}/test`;
  try {
    assert.equal(proxyFor(new URL(local), {}), null);
    assert(bypassProxy(new URL(local), "localhost"));
    assert(bypassProxy(new URL("https://api.example.com"), ".example.com"));
    assert(!bypassProxy(new URL("https://badexample.com"), ".example.com"));
    assert(!bypassProxy(new URL(local), "localhost:1"));
    assert(bypassProxy(new URL("https://[::1]"), "[::1]:443"));
    assert.equal(proxyFor(new URL(local), { HTTPS_PROXY: proxyUrl, NO_PROXY: "*" }), null);
    assert.equal(proxyFor(new URL(local), { HTTP_PROXY: proxyUrl }).href, new URL(proxyUrl).href);
    assert.equal(proxyFor(new URL(local), { https_proxy: proxyUrl, HTTPS_PROXY: "invalid" }).href, new URL(proxyUrl).href);

    process.env.HTTPS_PROXY = proxyUrl;
    const response = await fetchWithProxy(local, { signal: AbortSignal.timeout(2000), headers: { Authorization: "Bearer test-only" } });
    assert.equal(response.status, 200); assert.equal(tunnels, 1);
    assert((await response.text()).includes("9007199254740993"));
    assert.equal(headers.at(-1)["proxy-authorization"], undefined, "Proxy credentials must not reach origin");
    assert.equal(headers.at(-1).authorization, "Bearer test-only");

    const redirected = await fetchWithProxy(local.replace("/test", "/redirect"), {
      signal: AbortSignal.timeout(2000), headers: { Authorization: "Bearer test-only" },
    });
    assert.equal(redirected.status, 200); assert.equal(headers.at(-1).authorization, "Bearer test-only");
    await fetchWithProxy(local.replace("/test", "/cross-origin"), {
      signal: AbortSignal.timeout(2000), headers: { Authorization: "Bearer test-only" },
    });
    assert.equal(headers.at(-1).authorization, undefined, "Redirects must not leak origin credentials");

    process.env.HTTPS_PROXY = `https://user:private-proxy-password@127.0.0.1:${secureProxy.address().port}`;
    assert.equal((await fetchWithProxy(local, { signal: AbortSignal.timeout(2000) })).status, 200);
    process.env.HTTPS_PROXY = proxyUrl;
    await assert.rejects(fetchWithProxy("https://wrong-host.example/test", { signal: AbortSignal.timeout(2000) }), { code: "ERR_TLS_CERT_ALTNAME_INVALID" });

    const base = { apiPath: "/v1/indexer/blockchain/info", apiKey: "test-only" };
    const cli = await callApi(base);
    assert.equal(cli.mode, "detail"); assert.equal(cli.response.body.data.amount, "9007199254740993");
    const body = '{"tickers":["ordi"],"amount":9007199254740993}';
    assert.equal((await callApi({ ...base, apiPath: "/v3/market/brc20/auction/brc20_types", body })).mode, "detail");
    assert.equal(bodies.at(-1), body, "POST precision must survive proxy transport");
    const handlers = {};
    registerTools({ registerTool(name, _metadata, run) { handlers[name] = run; } });
    const mcp = await handlers.call_api({ path: base.apiPath, apiKey: "test-only" });
    assert.equal(mcp.isError, false); assert.equal(headers.at(-1)["x-unisat-ai-client"], "mcp");

    const before = tunnels;
    process.env.NO_PROXY = "localhost,127.0.0.1";
    const direct = await fetchWithProxy(local.replace("localhost", "127.0.0.1"), { signal: AbortSignal.timeout(2000) });
    assert.equal(direct.status, 200);
    assert.equal(tunnels, before);

    process.env.HTTP_PROXY = proxyUrl;
    delete process.env.NO_PROXY;
    const plainResponse = await fetchWithProxy(`http://127.0.0.1:${plain.address().port}/plain`, { signal: AbortSignal.timeout(2000) });
    assert.equal(plainResponse.status, 200); assert.equal(forwardHits, 1);

    rejectConnect = true;
    const beforeReject = hits;
    const rejected = await callApi(base);
    assert.equal(rejected.mode, "network_error"); assert.equal(rejected.network.code, "PROXY_AUTH_REQUIRED");
    assert.equal(rejected.retryable, false); assert.equal(hits, beforeReject);
    assert(!JSON.stringify(rejected).includes("private-proxy-password"));
    const mcpRejected = await handlers.call_api({ path: base.apiPath, apiKey: "test-only" });
    assert.equal(mcpRejected.isError, true); assert.equal(mcpRejected.structuredContent.network.code, "PROXY_AUTH_REQUIRED");

    rejectConnect = false; stall = true;
    await assert.rejects(fetchWithProxy(local, { signal: AbortSignal.timeout(50) }), { name: "AbortError" });
    stall = false;
    process.env.HTTPS_PROXY = "socks5://private-proxy-password@localhost:1";
    const invalid = await callApi(base);
    assert.equal(invalid.network.code, "INVALID_PROXY"); assert.equal(hits, beforeReject);
    assert(!JSON.stringify(invalid).includes("private-proxy-password"));
    assert.deepEqual(networkDiagnostic({ cause: { code: "ECONNRESET" } }, local), { viaProxy: true, code: "INVALID_PROXY" });
  } finally {
    for (const socket of sockets) socket.destroy();
    await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  }
}

if (process.argv.includes("--child")) await checks();
