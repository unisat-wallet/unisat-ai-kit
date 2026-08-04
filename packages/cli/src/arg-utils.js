function parseArgs(argv) {
  const positionals = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "-h") {
      pushOption(options, "help", "true");
      continue;
    }
    if (token === "-v") {
      pushOption(options, "version", "true");
      continue;
    }
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const inlineEqualsIndex = token.indexOf("=");
    const hasInlineValue = inlineEqualsIndex !== -1;
    const key = hasInlineValue ? token.slice(2, inlineEqualsIndex) : token.slice(2);
    const inlineValue = hasInlineValue ? token.slice(inlineEqualsIndex + 1) : undefined;
    const nextToken = argv[index + 1];

    if (hasInlineValue) {
      pushOption(options, key, inlineValue);
      continue;
    }

    if (!nextToken || nextToken.startsWith("--")) {
      pushOption(options, key, "true");
      continue;
    }

    pushOption(options, key, nextToken);
    index += 1;
  }

  return {
    positionals,
    options,
  };
}

function pushOption(options, key, value) {
  if (!Object.prototype.hasOwnProperty.call(options, key)) {
    options[key] = value;
    return;
  }

  if (Array.isArray(options[key])) {
    options[key].push(value);
    return;
  }

  options[key] = [options[key], value];
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseJsonObject(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  const parsed = JSON.parse(String(value));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("expected a JSON object");
  }
  return parsed;
}

function parseScalar(value) {
  const text = String(value);
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return text;
}

function parseKeyValueEntries(input) {
  if (!input) return {};
  const entries = Array.isArray(input) ? input : [input];
  return entries.reduce((result, entry) => {
    const text = String(entry).trim();
    const separatorIndex = text.indexOf("=");
    if (separatorIndex === -1) {
      throw new Error(`expected key=value entry, got ${text}`);
    }
    const key = text.slice(0, separatorIndex).trim();
    if (!key) {
      throw new Error(`expected non-empty key in entry ${text}`);
    }
    result[key] = parseScalar(text.slice(separatorIndex + 1).trim());
    return result;
  }, {});
}

function parseBooleanOption(value) {
  if (value === undefined) return false;
  if (value === true) return true;
  const text = String(value).toLowerCase();
  return text === "true" || text === "1" || text === "yes";
}

module.exports = {
  parseArgs,
  parseJsonObject,
  parseKeyValueEntries,
  parseBooleanOption,
  pushOption,
  toInt,
};
