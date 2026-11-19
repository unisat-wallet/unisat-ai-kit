// Keep JSON interoperable: exact numeric tokens that cannot safely round-trip
// through Number become strings, rather than BigInt (which JSON cannot encode).
function canonicalDecimal(token) {
  const [, sign, whole, fraction = "", exponent = "0"] = token.match(/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  let digits = (whole + fraction).replace(/^0+/, "");
  if (!digits) return "0";
  const trailing = digits.length - digits.replace(/0+$/, "").length;
  digits = digits.slice(0, digits.length - trailing);
  return `${sign}${digits}e${BigInt(exponent) - BigInt(fraction.length) + BigInt(trailing)}`;
}

function parseLosslessJson(text) {
  // Validate the original grammar first: rewriting numeric tokens must never
  // accidentally accept invalid JSON (for example an unquoted numeric key).
  const ordinary = JSON.parse(text);
  let changed = false;
  const preserved = text.replace(/"(?:\\[\s\S]|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (token) => {
    if (token.startsWith('"')) return token;
    const value = Number(token);
    if (!Number.isFinite(value)
      || (Number.isInteger(value) && !Number.isSafeInteger(value))
      || canonicalDecimal(token) !== canonicalDecimal(String(value))) {
      changed = true;
      return JSON.stringify(token);
    }
    return token;
  });
  return changed ? JSON.parse(preserved) : ordinary;
}

module.exports = { parseLosslessJson };
