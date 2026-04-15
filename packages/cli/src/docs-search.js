const path = require("path");
const { getSourceRoots } = require("./repo-paths");
const { walkFiles, readUtf8 } = require("./file-utils");

function countOccurrences(haystack, needle) {
  let count = 0;
  let startIndex = 0;
  while (true) {
    const index = haystack.indexOf(needle, startIndex);
    if (index === -1) {
      return count;
    }
    count += 1;
    startIndex = index + needle.length;
  }
}

function buildSnippet(content, query) {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerContent.indexOf(lowerQuery);
  if (index === -1) {
    return content.slice(0, 180).replace(/\s+/g, " ").trim();
  }

  const start = Math.max(0, index - 70);
  const end = Math.min(content.length, index + query.length + 110);
  return content.slice(start, end).replace(/\s+/g, " ").trim();
}

function searchDocs(query, limit) {
  const { unisatDevDocsDir } = getSourceRoots();
  const docsRoot = path.join(unisatDevDocsDir, "open-api");
  const files = walkFiles(docsRoot, (filePath) => {
    return filePath.endsWith(".md") && !filePath.includes(`${path.sep}auto-generated${path.sep}`);
  });

  const normalizedQuery = query.trim().toLowerCase();
  const matches = files
    .map((filePath) => {
      const content = readUtf8(filePath);
      const lowerContent = content.toLowerCase();
      const score = countOccurrences(lowerContent, normalizedQuery);
      if (score === 0) {
        return null;
      }

      return {
        title: path.basename(filePath),
        file: path.relative(unisatDevDocsDir, filePath),
        score,
        snippet: buildSnippet(content, query),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.file.localeCompare(right.file))
    .slice(0, limit);

  return {
    command: "docs.search",
    query,
    sourceRoot: docsRoot,
    results: matches,
  };
}

module.exports = {
  searchDocs,
};
