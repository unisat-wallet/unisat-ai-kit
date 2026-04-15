const fs = require("fs");
const path = require("path");
const { getSourceRoots } = require("./repo-paths");

const ERROR_RANGES = [
  {
    service: "common",
    range: "-1 ~ -99",
    description: "Cross-service errors, including network issues and authentication failures",
    min: -99,
    max: -1,
  },
  {
    service: "marketplace",
    range: "-100 ~ -999",
    description: "Errors related to trading, NFT operations, and auctions",
    min: -999,
    max: -100,
  },
  {
    service: "inscribe",
    range: "-1000 ~ -1999",
    description: "Errors specific to the Inscribe module",
    min: -1999,
    max: -1000,
  },
  {
    service: "basic-brc20-indexer",
    range: "-3000 ~ -3999",
    description: "Errors related to Basic and BRC20 protocol indexing",
    min: -3999,
    max: -3000,
  },
  {
    service: "runes-indexer",
    range: "-4000 ~ -4999",
    description: "Errors related to Runes protocol indexing",
    min: -4999,
    max: -4000,
  },
  {
    service: "alkanes-indexer",
    range: "-5000 ~ -5999",
    description: "Errors related to Alkanes protocol indexing",
    min: -5999,
    max: -5000,
  },
];

function loadErrorIndex() {
  const { unisatDevDocsDir } = getSourceRoots();
  const jsonPath = path.join(
    unisatDevDocsDir,
    "errors",
    "auto-generated",
    "open-api-errors.json"
  );

  return {
    sourceFile: path.relative(unisatDevDocsDir, jsonPath),
    data: JSON.parse(fs.readFileSync(jsonPath, "utf8")),
  };
}

function getRangeHint(code) {
  return ERROR_RANGES.find((item) => code >= item.min && code <= item.max) || null;
}

function explainErrorByCode(code) {
  const { sourceFile, data } = loadErrorIndex();
  const key = String(code);
  const entry = data.errors[key];
  const rangeHint = getRangeHint(Number(code));

  return {
    command: "error.explain",
    mode: "detail",
    code: Number(code),
    found: Boolean(entry),
    sourceFile,
    metadata: data.metadata,
    rangeHint,
    error: entry
      ? {
          code: Number(code),
          key: entry.key,
          message: entry.message,
          service: entry.service,
          hasVariable: Boolean(entry.has_variable),
        }
      : null,
  };
}

function explainErrorByQuery(query, limit) {
  const { sourceFile, data } = loadErrorIndex();
  const normalized = query.trim().toLowerCase();

  const results = Object.entries(data.errors)
    .map(([code, entry]) => {
      const haystack = `${entry.key} ${entry.message} ${entry.service}`.toLowerCase();
      if (!haystack.includes(normalized)) {
        return null;
      }

      const exactBoost =
        entry.key.toLowerCase() === normalized || entry.message.toLowerCase() === normalized ? 10 : 0;
      const score = exactBoost + (haystack.match(new RegExp(normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;

      return {
        code: Number(code),
        key: entry.key,
        message: entry.message,
        service: entry.service,
        hasVariable: Boolean(entry.has_variable),
        score,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.code - right.code)
    .slice(0, limit);

  return {
    command: "error.explain",
    mode: "matches",
    query,
    sourceFile,
    metadata: data.metadata,
    results,
  };
}

module.exports = {
  explainErrorByCode,
  explainErrorByQuery,
};
