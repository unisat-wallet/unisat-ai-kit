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
  description: "Uses the selected environment's configured key or --api-key. Calls the developer service with Bearer authentication; no query parameters or confirmation are required. response.body.data contains reqPerDay, optional reqPerMonth, qpsQuota, cumulReqQuota, reqQuota, creditsToday, creditsYesterday, creditsThisMonth, creditsLastMonth, and expireTime (Unix timestamp in seconds). Preserve expireTime=0 as returned by the backend; do not infer unlimited quota from it. Use getCredits --env bitcoin --format json or getCredits --env fractal --format json.",
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

module.exports = { creditsOperation };
