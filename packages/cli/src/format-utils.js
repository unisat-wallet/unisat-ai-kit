function printOutput(payload, format) {
  if (format === "json") {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (payload.command === "api.call") {
    if (payload.mode === "missing_api_key") {
      console.error(payload.message);
      console.error("Bitcoin key: UNISAT_BITCOIN_API_KEY");
      console.error("Fractal key: UNISAT_FRACTAL_API_KEY");
      if (payload.developerPortalUrl) {
        console.error(`Register API key: ${payload.developerPortalUrl}`);
      }
      console.error("Example: unisat-ai-cli api call --env bitcoin --path \"/v1/price/btc\" --api-key YOUR_API_KEY");
      return;
    }

    if (payload.mode === "not_found") {
      console.log(`path not found: ${payload.path}`);
      return;
    }

    if (payload.mode === "api_key_error") {
      console.error(payload.message);
      console.error(`key source: ${payload.usedApiKeyFrom}`);
      console.error(`status: ${payload.response.status} ${payload.response.statusText}`);
      if (typeof payload.response.body === "string") {
        console.error(payload.response.body);
        return;
      }
      console.error(JSON.stringify(payload.response.body, null, 2));
      return;
    }

    console.log(`${payload.method.toUpperCase()} ${payload.path}`);
    if (payload.environment) {
      console.log(`environment: ${payload.environment}${payload.environmentLabel ? ` (${payload.environmentLabel})` : ""}`);
    }
    console.log(`url: ${payload.url}`);
    console.log(`status: ${payload.response.status} ${payload.response.statusText}`);
    console.log("");
    if (typeof payload.response.body === "string") {
      console.log(payload.response.body);
      return;
    }
    console.log(JSON.stringify(payload.response.body, null, 2));
    return;
  }

  if (payload.command === "config.bitcoin-key" || payload.command === "config.fractal-key") {
    console.log(`saved ${payload.environment} API key`);
    console.log(`key env: ${payload.keyEnv}`);
    console.log(`env file: ${payload.envPath}`);
    return;
  }

  if (payload.command === "intro.show") {
    if (payload.mode === "not_found") {
      console.log(`path not found: ${payload.path}`);
      return;
    }

    console.log(`${payload.method.toUpperCase()} ${payload.path}`);
    console.log(`domain: ${payload.domain}`);
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
    if (payload.servers.length > 0) {
      console.log(`servers: ${payload.servers.join(", ")}`);
    }
    if (payload.parameters.length > 0) {
      console.log("parameters:");
      payload.parameters.forEach((item) => {
        console.log(
          `- ${item.name} (${item.in || "unknown"}, ${item.required ? "required" : "optional"}, ${item.type || "unknown"})${item.description ? `: ${item.description}` : ""}`
        );
      });
    }
    if (payload.requestBodyTemplate) {
      console.log("requestBodyTemplate:");
      console.log(JSON.stringify(payload.requestBodyTemplate, null, 2));
    }
    return;
  }

  if (payload.command === "intro.resolve") {
    if (payload.mode === "missing_input") {
      console.log(payload.message);
      return;
    }

    if (payload.mode === "not_found") {
      if (payload.query) {
        console.log(`no interface matched query: ${payload.query}`);
      } else {
        console.log(`path not found: ${payload.path}`);
      }
      return;
    }

    if (payload.mode === "ambiguous") {
      console.log(`ambiguous query: ${payload.query}`);
      console.log(`top candidate: ${payload.selected.method.toUpperCase()} ${payload.selected.path}`);
      console.log(`domain: ${payload.selected.domain}`);
      console.log(`file: ${payload.selected.file}`);
      if (payload.selected.summary) {
        console.log(`summary: ${payload.selected.summary}`);
      }
      console.log(`confidence: ${payload.match.confidence}`);
      if (payload.match.score !== null) {
        console.log(`score: ${payload.match.score}`);
      }
      if (payload.match.conflictingSignals.length > 0) {
        console.log("conflicts:");
        payload.match.conflictingSignals.forEach((item) => console.log(`- ${item}`));
      }
      if (payload.match.rankingNotes.length > 0) {
        console.log("notes:");
        payload.match.rankingNotes.forEach((item) => console.log(`- ${item}`));
      }
      if (payload.alternatives.length > 0) {
        console.log("");
        console.log("alternatives:");
        payload.alternatives.forEach((item, index) => {
          console.log(`${index + 1}. ${item.method.toUpperCase()} ${item.path}`);
          if (item.summary) {
            console.log(`summary: ${item.summary}`);
          }
          if (item.whyMatched) {
            console.log(`why: ${item.whyMatched}`);
          }
        });
      }
      return;
    }

    console.log(`${payload.selected.method.toUpperCase()} ${payload.selected.path}`);
    console.log(`environment: ${payload.environment}`);
    console.log(`domain: ${payload.selected.domain}`);
    console.log(`file: ${payload.selected.file}`);
    if (payload.selected.summary) {
      console.log(`summary: ${payload.selected.summary}`);
    }
    if (payload.selected.description) {
      console.log(`description: ${payload.selected.description}`);
    }
    console.log(`confidence: ${payload.match.confidence}`);
    if (payload.match.score !== null) {
      console.log(`score: ${payload.match.score}`);
    }
    if (payload.match.whyMatched.length > 0) {
      console.log("why:");
      payload.match.whyMatched.forEach((item) => console.log(`- ${item}`));
    }
    if (payload.match.missingBusinessInputs.length > 0) {
      console.log(`missing business inputs: ${payload.match.missingBusinessInputs.join(", ")}`);
    }
    if (payload.match.missingDefaultableInputs.length > 0) {
      console.log(`defaultable inputs: ${payload.match.missingDefaultableInputs.join(", ")}`);
    }

    const groups = [
      ["pathParams", "path params"],
      ["queryParams", "query params"],
      ["headerParams", "header params"],
      ["cookieParams", "cookie params"],
    ];

    console.log("parameters:");
    groups.forEach(([key, label]) => {
      if (payload.parameters[key].length === 0) {
        return;
      }
      console.log(`${label}:`);
      payload.parameters[key].forEach((item) => {
        console.log(
          `- ${item.name} (${item.required ? "required" : "optional"}, ${item.type || "unknown"})${item.description ? `: ${item.description}` : ""}`
        );
      });
    });

    if (payload.parameters.requestBodyTemplate) {
      console.log("request body:");
      console.log(JSON.stringify(payload.parameters.requestBodyTemplate, null, 2));
    }

    console.log("");
    console.log("example:");
    console.log(payload.example.command);

    if (payload.alternatives.length > 0) {
      console.log("");
      console.log("alternatives:");
      payload.alternatives.forEach((item, index) => {
        console.log(`${index + 1}. ${item.method.toUpperCase()} ${item.path}`);
        if (item.summary) {
          console.log(`summary: ${item.summary}`);
        }
        if (item.whyMatched) {
          console.log(`why: ${item.whyMatched}`);
        }
      });
    }
  }
}

module.exports = {
  printOutput,
};
