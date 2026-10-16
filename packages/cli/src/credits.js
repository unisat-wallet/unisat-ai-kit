// Built-in operation: the developer service resolves the network from the key.
const creditsOperation = {
  commandName: "getCredits",
  operationId: "getCredits",
  method: "get",
  path: "/openapi/public/get_credits",
  baseUrl: "https://developer.unisat.io",
  file: "builtin:credits",
  domain: "credits",
  tags: ["Credits"],
  summary: "Get current API key limits, usage, and expiration",
  description: "Uses the selected environment's configured key or --api-key. Calls the developer service with Bearer authentication; no query parameters or confirmation are required. response.body.data contains reqPerDay, optional reqPerMonth, qpsQuota, reqQuota, creditsToday, creditsYesterday, creditsThisMonth, creditsLastMonth, and expireTime (Unix timestamp in seconds). expireTime=0 means no expiration (valid indefinitely); positive values are Unix timestamps in seconds. No expiration does not imply unlimited quota. reqQuota is the remaining times-based credit balance, NOT the remaining daily allowance. The cumulative allocation field is omitted from query results. reqPerDay is the daily limit and creditsToday is daily consumption; their difference is a separate daily allowance calculation, not reqQuota. Do not infer total access from reqQuota alone. Quota/usage units follow backend credit accounting, not necessarily one credit per HTTP request. Use getCredits --env bitcoin --format json or getCredits --env fractal --format json.",
  unisat: {
    "x-unisat-domain": "credits",
    "x-unisat-network": "multi",
    "x-unisat-status": "recommended",
    "x-unisat-readonly": true,
    "x-unisat-requires-confirmation": false,
  },
  parameters: [],
  parametersSummary: { pathRequired: [], queryRequired: [], queryOptional: [] },
  requestBody: { required: false, contentTypes: [] },
  readOnly: true,
  requiresApiKey: true,
  requiresConfirmation: false,
};

function normalizeCreditsResponse(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)
      || !body.data || typeof body.data !== "object" || Array.isArray(body.data)) return body;
  const data = { ...body.data };
  delete data.cumulReqQuota;
  return { ...body, data };
}

module.exports = { creditsOperation, normalizeCreditsResponse };
