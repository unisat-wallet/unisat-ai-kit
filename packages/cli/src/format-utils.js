function printOutput(payload, format) {
  if (format === "json") {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (payload.command === "docs.search") {
    console.log(`query: ${payload.query}`);
    console.log(`results: ${payload.results.length}`);
    payload.results.forEach((item, index) => {
      console.log("");
      console.log(`${index + 1}. ${item.title}`);
      console.log(`file: ${item.file}`);
      console.log(`score: ${item.score}`);
      console.log(`snippet: ${item.snippet}`);
    });
    return;
  }

  if (payload.command === "openapi.explain") {
    if (payload.mode === "matches") {
      console.log(`keyword: ${payload.keyword}`);
      console.log(`matches: ${payload.matches.length}`);
      payload.matches.forEach((item, index) => {
        console.log("");
        console.log(`${index + 1}. ${item.method.toUpperCase()} ${item.path}`);
        console.log(`file: ${item.file}`);
        if (item.summary) {
          console.log(`summary: ${item.summary}`);
        }
      });
      return;
    }

    console.log(`${payload.method.toUpperCase()} ${payload.path}`);
    console.log(`file: ${payload.file}`);
    if (payload.operationId) {
      console.log(`operationId: ${payload.operationId}`);
    }
    if (payload.summary) {
      console.log(`summary: ${payload.summary}`);
    }
    if (payload.description) {
      console.log(`description: ${payload.description}`);
    }
    if (payload.tags.length > 0) {
      console.log(`tags: ${payload.tags.join(", ")}`);
    }
    if (payload.parameters.length > 0) {
      console.log("parameters:");
      payload.parameters.forEach((item) => {
        console.log(
          `- ${item.name} (${item.in || "unknown"}, ${item.required ? "required" : "optional"}, ${item.type || "unknown"})${item.description ? `: ${item.description}` : ""}`
        );
      });
    }
  }

  if (payload.command === "error.explain") {
    if (payload.mode === "matches") {
      console.log(`query: ${payload.query}`);
      console.log(`results: ${payload.results.length}`);
      payload.results.forEach((item, index) => {
        console.log("");
        console.log(`${index + 1}. ${item.code} ${item.key}`);
        console.log(`service: ${item.service}`);
        console.log(`message: ${item.message}`);
        if (item.hasVariable) {
          console.log("note: message contains template variables");
        }
      });
      return;
    }

    console.log(`code: ${payload.code}`);
    if (payload.error) {
      console.log(`service: ${payload.error.service}`);
      console.log(`key: ${payload.error.key}`);
      console.log(`message: ${payload.error.message}`);
      if (payload.error.hasVariable) {
        console.log("note: message contains template variables");
      }
    } else {
      console.log("message: error code not found in current generated index");
    }

    if (payload.rangeHint) {
      console.log(`range: ${payload.rangeHint.range}`);
      console.log(`module: ${payload.rangeHint.service}`);
      console.log(`hint: ${payload.rangeHint.description}`);
    }
  }

  if (payload.command === "snippet.generate") {
    if (payload.mode === "not_found") {
      console.log(`path not found: ${payload.path}`);
      return;
    }

    console.log(`${payload.method.toUpperCase()} ${payload.path}`);
    console.log(`language: ${payload.language}`);
    console.log(`baseUrl: ${payload.baseUrl}`);
    console.log(`file: ${payload.file}`);
    if (payload.summary) {
      console.log(`summary: ${payload.summary}`);
    }
    console.log("");
    console.log(payload.snippet);
  }
}

module.exports = {
  printOutput,
};
