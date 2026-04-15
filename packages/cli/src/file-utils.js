const fs = require("fs");
const path = require("path");

function walkFiles(dir, predicate, results = []) {
  if (!fs.existsSync(dir)) {
    return results;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, results);
      continue;
    }

    if (predicate(fullPath)) {
      results.push(fullPath);
    }
  }

  return results;
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

module.exports = {
  walkFiles,
  readUtf8,
};
