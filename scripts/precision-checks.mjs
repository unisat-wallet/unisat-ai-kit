import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { buildAppSource } from "./package-single-cli.mjs";
const require = createRequire(import.meta.url);
const { parseLosslessJson } = require("../packages/cli/src/lossless-json");
const { callApi } = require("../packages/cli");
const { registerTools } = require("../packages/mcp-server/src/tools");

export async function runPrecisionChecks() {
  const fixture = String.raw`{"code":0,"data":{"supply":10965618181974313,"safe":9007199254740991,"negative":-9007199254740993,"boundary":9007199254740992,"decimal":0.10000000000000001,"largeDecimal":9007199254740991.1,"exponent":9.007199254740993e15,"overflow":1e400,"tiny":1e-400,"normal":0.1,"nested":[10965618181974313,1.5,null,true],"literal":"10965618181974313 and \"quoted\"","zero":-0}}`;
  const expected = parseLosslessJson(fixture);
  assert.equal(expected.data.supply, "10965618181974313");
  assert.equal(expected.data.safe, Number.MAX_SAFE_INTEGER);
  assert.equal(expected.data.negative, "-9007199254740993");
  assert.equal(expected.data.boundary, "9007199254740992");
  assert.equal(expected.data.decimal, "0.10000000000000001");
  assert.equal(expected.data.largeDecimal, "9007199254740991.1");
  assert.equal(expected.data.exponent, "9.007199254740993e15");
  assert.equal(expected.data.overflow, "1e400");
  assert.equal(expected.data.tiny, "1e-400");
  assert.equal(expected.data.normal, 0.1);
  assert.deepEqual(expected.data.nested, ["10965618181974313", 1.5, null, true]);
  assert.equal(expected.data.literal, '10965618181974313 and "quoted"');
  assert.ok(Object.is(expected.data.zero, -0));
  assert.deepEqual(parseLosslessJson('{"9007199254740993":"123","x":"backslash \\\\ and quote \\""}'), {"9007199254740993":"123", x:'backslash \\ and quote "'});
  for (const text of ['{9007199254740993:0}', '[01]', '[1e]', '{"x":10965618181974313,}', 'undefined']) {
    assert.throws(() => parseLosslessJson(text), SyntaxError);
  }
  assert.equal(parseLosslessJson('1.00e2'), 100);
  assert.equal(parseLosslessJson('10965618181974313'), '10965618181974313');
  const handlers = {};
  registerTools({ registerTool(name, _meta, handler) { handlers[name] = handler; } });
  const originalFetch = globalThis.fetch;
  let requests = 0;
  try {
    globalThis.fetch = async () => { requests++; return new Response(fixture, { headers: { 'content-type': 'application/json' } }); };
    const result = await callApi({ apiPath: '/v1/indexer/blockchain/info', apiKey: 'fake' });
    assert.deepEqual(result.response.body, expected);
    const mcp = await handlers.call_api({ path: '/v1/indexer/blockchain/info', apiKey: 'fake' });
    assert.equal(mcp.isError, false);
    assert.equal(mcp.structuredContent.response.body.data.supply, '10965618181974313');
    assert.equal(JSON.parse(mcp.content[0].text).response.body.data.supply, '10965618181974313');
    const body = '{ "amount": 10965618181974313, "decimal": 0.10000000000000001 }';
    globalThis.fetch = async (_url, options) => { assert.equal(options.body, body); return Response.json({code:0}); };
    const post = await callApi({ apiPath: '/v3/market/brc20/auction/brc20_types', apiKey:'fake', body });
    assert.equal(post.mode, 'detail');
    assert.equal(post.request.body.amount, '10965618181974313');
    globalThis.fetch = async () => { requests++; return Response.json({code:0}); };
    const path = '/v1/indexer/address/{address}/brc20/summary';
    const before = requests;
    for (const value of ['32', '56']) {
      for (const dryRun of [true, false]) {
        const rejected = await callApi({apiPath:path, apiKey:'fake', environment:'fractal', pathParamsList:{address:'test'}, queryParamsList:{tick_filter:value,start:0,limit:1}, dryRun});
        assert.equal(rejected.mode, 'invalid_parameters');
        assert.equal(rejected.retryable, false);
      }
      const rejected = await handlers.call_api({path, apiKey:'fake', environment:'fractal', pathParamEntries:{address:'test'}, queryParams:{tick_filter:value,start:0,limit:1}});
      assert.equal(rejected.isError, true);
    }
    assert.equal(requests, before, 'Unsupported Fractal filters must never reach the network');
    for (const environment of ['bitcoin', 'fractal']) {
      for (const value of environment === 'bitcoin' ? ['32','56'] : ['8','16','24']) {
        const result = await callApi({apiPath:path, apiKey:'fake', environment, pathParamsList:{address:'test'}, queryParamsList:{tick_filter:value,start:0,limit:1}});
        assert.equal(result.mode, 'detail');
      }
    }
    // Run both source CLI and the single-file bundle with an exact raw fixture.
    for (const bundle of [false, true]) {
      const source = `global.fetch=async()=>new Response(${JSON.stringify(fixture)},{headers:{'content-type':'application/json'}});process.argv=['node','cli','getBlockchainInfo','--api-key','fake','--format','json'];\n` + (bundle ? buildAppSource() : "require('./packages/cli/bin/unisat-ai.js');");
      const cli = spawnSync(process.execPath, ['-'], {input:"process.env.OPENAPI_SWAGGER_DIR=require('path').resolve('swagger');\n"+source,encoding:'utf8',timeout:10000});
      assert.ifError(cli.error);
      assert.equal(cli.status, 0, `bundle=${bundle}: ${cli.stderr} ${cli.stdout}`);
      assert.equal(JSON.parse(cli.stdout).response.body.data.supply, '10965618181974313');
    }
    for (const command of [['getBrc20SummaryByAddress','--address','test','--tick_filter','56','--start','0','--limit','1'],['api','call','--path',path,'--path-param','address=test','--query-param','tick_filter=32','--query-param','start=0','--query-param','limit=1']]) {
      const args = [...command,'--env','fractal','--dry-run','--format','json'];
      const cli = spawnSync(process.execPath, ['-'], {input:`process.argv=['node','cli',...${JSON.stringify(args)}];require('./packages/cli/bin/unisat-ai.js');`,encoding:'utf8',timeout:10000});
      assert.equal(cli.status, 1, cli.stderr);
      assert.equal(JSON.parse(cli.stdout).mode, 'invalid_parameters');
    }
  } finally { globalThis.fetch = originalFetch; }
}
