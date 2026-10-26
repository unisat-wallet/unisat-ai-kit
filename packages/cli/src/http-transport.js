const http = require("node:http");
const https = require("node:https");
const tls = require("node:tls");
const net = require("node:net");
const zlib = require("node:zlib");

function hostname(url) {
  return url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

function bypassProxy(url, value) {
  const host = hostname(url);
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  return String(value || "").split(/[\s,]+/).some((entry) => {
    if (!entry) return false;
    if (entry === "*") return true;
    let name = entry.toLowerCase(), entryPort;
    const match = name.match(/^(\[[^\]]+\]|[^:]+):(\d+)$/);
    if (match) [, name, entryPort] = match;
    if (entryPort && entryPort !== port) return false;
    name = name.replace(/^\[|\]$/g, "");
    if (name.startsWith("*.")) return host.endsWith(name.slice(1));
    if (name.startsWith(".")) return host === name.slice(1) || host.endsWith(name);
    return host === name;
  });
}

function proxyFor(url, env = process.env) {
  if (bypassProxy(url, env.no_proxy || env.NO_PROXY)) return null;
  const value = url.protocol === "https:"
    ? env.https_proxy || env.HTTPS_PROXY || env.http_proxy || env.HTTP_PROXY
    : env.http_proxy || env.HTTP_PROXY;
  if (!value) return null;
  let proxy;
  try {
    proxy = new URL(value);
    if (!["http:", "https:"].includes(proxy.protocol) || proxy.pathname !== "/" || proxy.search || proxy.hash) throw Error();
  } catch {
    const error = new Error("Proxy must be an http:// or https:// URL.");
    error.code = "INVALID_PROXY";
    throw error;
  }
  return proxy;
}

function proxyHeaders(proxy) {
  if (!proxy.username && !proxy.password) return {};
  return { "Proxy-Authorization": "Basic " + Buffer.from(
    decodeURIComponent(proxy.username) + ":" + decodeURIComponent(proxy.password)
  ).toString("base64") };
}

function tunnelAgent(target, proxy, signal) {
  const agent = new https.Agent({ keepAlive: false });
  agent.createConnection = (_options, callback) => {
    const authority = target.hostname + ":" + (target.port || "443");
    const connect = (proxy.protocol === "https:" ? https : http).request({
      hostname: hostname(proxy), port: proxy.port || (proxy.protocol === "https:" ? 443 : 80),
      method: "CONNECT", path: authority, headers: { Host: authority, ...proxyHeaders(proxy) },
      signal, agent: false,
    });
    let settled = false;
    const finish = (error, socket) => {
      if (settled) return;
      settled = true;
      callback(error, socket);
    };
    connect.once("error", finish);
    connect.once("connect", (response, socket, head) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        const error = new Error("Proxy CONNECT rejected.");
        error.code = response.statusCode === 407 ? "PROXY_AUTH_REQUIRED" : "PROXY_CONNECT_REJECTED";
        finish(error);
        return;
      }
      if (head.length) socket.unshift(head);
      const secure = tls.connect({ socket, host: hostname(target), servername: net.isIP(hostname(target)) ? undefined : hostname(target) });
      const abort = () => secure.destroy(signal?.reason);
      signal?.addEventListener("abort", abort, { once: true });
      secure.once("close", () => signal?.removeEventListener("abort", abort));
      secure.once("error", finish);
      secure.once("secureConnect", () => finish(null, secure));
      if (signal?.aborted) abort();
    });
    connect.end();
  };
  return agent;
}

function proxyRequest(target, proxy, options) {
  return new Promise((resolve, reject) => {
    const secure = target.protocol === "https:";
    const agent = secure ? tunnelAgent(target, proxy, options.signal) : null;
    const transport = secure || proxy.protocol === "https:" ? https : http;
    const request = transport.request({ ...(secure ? {
      hostname: hostname(target), port: target.port || 443,
      path: target.pathname + target.search, agent,
    } : {
      hostname: hostname(proxy), port: proxy.port || (proxy.protocol === "https:" ? 443 : 80),
      path: target.href, agent: false,
    }),
      method: options.method || "GET", signal: options.signal,
      headers: { ...options.headers, Host: target.host, ...(!secure ? proxyHeaders(proxy) : {}) },
    }, (response) => {
      if (!secure && response.statusCode === 407) {
        response.resume();
        const error = new Error("Proxy authentication required.");
        error.code = "PROXY_AUTH_REQUIRED";
        reject(error);
        return;
      }
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.once("error", reject);
      response.once("end", () => {
        agent?.destroy();
        try {
          let data = Buffer.concat(chunks);
          const encoding = response.headers["content-encoding"];
          if (encoding === "gzip") data = zlib.gunzipSync(data);
          else if (encoding === "deflate") data = zlib.inflateSync(data);
          else if (encoding === "br") data = zlib.brotliDecompressSync(data);
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode, statusText: response.statusMessage,
            headers: new Headers(Object.entries(response.headers).filter(([, value]) => value !== undefined)),
            text: async () => data.toString("utf8"),
            json: async () => JSON.parse(data.toString("utf8")),
            arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
          });
        } catch (error) { reject(error); }
      });
    });
    request.once("error", error => { agent?.destroy(); reject(error); });
    request.end(options.body);
  });
}

async function fetchWithProxy(url, options = {}) {
  let target = new URL(url);
  for (let redirects = 0; ; redirects++) {
    const proxy = proxyFor(target);
    if (!proxy) return fetch(target.href, options);
    const response = await proxyRequest(target, proxy, options);
    const location = response.headers.get("location");
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) return response;
    if (redirects === 20) throw Object.assign(new Error("Too many redirects."), { code: "REDIRECT_LIMIT" });
    const next = new URL(location, target);
    if (!["http:", "https:"].includes(next.protocol) || next.username || next.password) {
      throw Object.assign(new Error("Invalid redirect."), { code: "INVALID_REDIRECT" });
    }
    const headers = { ...options.headers };
    if (next.origin !== target.origin) {
      for (const key of Object.keys(headers)) if (["authorization", "cookie", "host"].includes(key.toLowerCase())) delete headers[key];
    }
    const method = (options.method || "GET").toUpperCase();
    if ((response.status === 303 && method !== "HEAD") || ([301, 302].includes(response.status) && method === "POST")) {
      for (const key of Object.keys(headers)) if (["content-type", "content-length"].includes(key.toLowerCase())) delete headers[key];
      options = { ...options, method: "GET", body: undefined };
    }
    options = { ...options, headers };
    target = next;
  }
}

function networkDiagnostic(error, url) {
  let proxy;
  try { proxy = proxyFor(new URL(url)); } catch { return { viaProxy: true, code: "INVALID_PROXY" }; }
  const rawCode = error?.cause?.code || error?.code;
  const code = typeof rawCode === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(rawCode) ? rawCode : undefined;
  return { viaProxy: Boolean(proxy), ...(code ? { code } : {}) };
}

module.exports = { fetchWithProxy, proxyFor, bypassProxy, networkDiagnostic };
