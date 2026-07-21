const OPENAPI_AGENT_RULES = {
  aliases: [
    {
      id: "alias.inswap.brc20-swap",
      type: "domain_alias",
      terms: ["inswap", "in-swap", "brc20-swap", "brc20 swap"],
      canonicalDomain: "brc20-swap",
      canonicalResource: "brc20SwapHistory",
      description: "InSwap and BRC20 Swap refer to the same UniSat swap product domain.",
    },
  ],
  domainRules: [
    {
      id: "domain.brc20-swap.fractal-only",
      type: "environment_constraint",
      domain: "brc20-swap",
      allowedEnvironments: ["fractal"],
      appliesToPathPrefix: ["/v1/brc20-swap/"],
      description: "BRC20 Swap / InSwap APIs are only supported in the Fractal environment.",
    },
    {
      id: "domain.brc20-prog.bitcoin-only",
      type: "environment_constraint",
      domain: "brc20-prog",
      allowedEnvironments: ["bitcoin"],
      appliesToPathPrefix: ["/v1/indexer/brc20-prog/"],
      description: "BRC20-Prog indexer APIs are only supported in the Bitcoin environment.",
    },
  ],
  entityRules: [
    {
      id: "entity.brc20.classic-ticker.length-4",
      type: "entity_constraint",
      domain: "brc20",
      entity: "ticker",
      constraints: { minLength: 4, maxLength: 4 },
      effect: "boost",
      description: "Classic BRC-20 ticker uses 4 characters, such as ordi.",
    },
    {
      id: "entity.brc20-prog.ticker.length-6",
      type: "entity_constraint",
      domain: "brc20-prog",
      entity: "ticker",
      constraints: { minLength: 6, maxLength: 6 },
      effect: "exclude_on_mismatch",
      description: "BRC20-Prog ticker must be 6 characters.",
    },
  ],
  parameterRules: [
    {
      id: "param.inscription-info.inscription-id-accepts-number",
      type: "parameter_alias",
      path: "/v1/indexer/inscription/info/{inscriptionId}",
      parameter: "inscriptionId",
      acceptsEntities: ["inscriptionId", "inscriptionid", "inscriptionNumber"],
      description: "The inscriptionId path parameter also accepts an inscription number.",
    },
  ],
};

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function pathMatchesPrefix(apiPath, prefixes = []) {
  return prefixes.some((prefix) => apiPath.startsWith(prefix));
}

function getRulesForCapability(capability) {
  const apiPath = capability.path || "";
  const domain = capability.capability?.domain || "";
  return {
    aliases: OPENAPI_AGENT_RULES.aliases.filter((rule) => rule.canonicalDomain === domain),
    domainRules: OPENAPI_AGENT_RULES.domainRules.filter((rule) => rule.domain === domain || pathMatchesPrefix(apiPath, rule.appliesToPathPrefix)),
    entityRules: OPENAPI_AGENT_RULES.entityRules.filter((rule) => rule.domain === domain),
    parameterRules: OPENAPI_AGENT_RULES.parameterRules.filter((rule) => rule.path === apiPath),
  };
}

function listAgentRules(filter = {}) {
  const domain = filter.domain;
  const apiPath = filter.path;
  const rules = {
    aliases: OPENAPI_AGENT_RULES.aliases,
    domainRules: OPENAPI_AGENT_RULES.domainRules,
    entityRules: OPENAPI_AGENT_RULES.entityRules,
    parameterRules: OPENAPI_AGENT_RULES.parameterRules,
  };

  if (!domain && !apiPath) return rules;

  return {
    aliases: rules.aliases.filter((rule) => !domain || rule.canonicalDomain === domain),
    domainRules: rules.domainRules.filter((rule) => (!domain || rule.domain === domain) && (!apiPath || pathMatchesPrefix(apiPath, rule.appliesToPathPrefix))),
    entityRules: rules.entityRules.filter((rule) => !domain || rule.domain === domain),
    parameterRules: rules.parameterRules.filter((rule) => !apiPath || rule.path === apiPath),
  };
}

function findDomainAliases(taskText, domain) {
  const text = normalizeText(taskText);
  return OPENAPI_AGENT_RULES.aliases.filter((rule) => rule.canonicalDomain === domain && rule.terms.some((term) => text.includes(normalizeText(term))));
}

module.exports = {
  OPENAPI_AGENT_RULES,
  findDomainAliases,
  getRulesForCapability,
  listAgentRules,
};
