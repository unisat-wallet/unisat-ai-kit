const OPENAPI_ENVIRONMENTS = {
  bitcoin: {
    name: "bitcoin",
    label: "Bitcoin Main",
    baseUrl: "https://open-api.unisat.io",
    apiKeyEnv: "UNISAT_BITCOIN_API_KEY",
  },
  fractal: {
    name: "fractal",
    label: "Fractal Bitcoin Main",
    baseUrl: "https://open-api-fractal.unisat.io",
    apiKeyEnv: "UNISAT_FRACTAL_API_KEY",
  },
};

const DEFAULT_OPENAPI_ENVIRONMENT = "bitcoin";

function normalizeEnvironmentName(value) {
  return String(value || DEFAULT_OPENAPI_ENVIRONMENT).toLowerCase();
}

function getOpenApiEnvironment(value) {
  const name = normalizeEnvironmentName(value);
  return OPENAPI_ENVIRONMENTS[name] || null;
}

function listOpenApiEnvironments() {
  return Object.values(OPENAPI_ENVIRONMENTS);
}

module.exports = {
  DEFAULT_OPENAPI_ENVIRONMENT,
  getOpenApiEnvironment,
  listOpenApiEnvironments,
};