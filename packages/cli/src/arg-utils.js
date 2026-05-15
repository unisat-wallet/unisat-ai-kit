function parseArgs(argv) {
  const positionals = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
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

module.exports = {
  parseArgs,
  pushOption,
  toInt,
};
