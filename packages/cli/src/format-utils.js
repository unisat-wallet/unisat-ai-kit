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
    return;
  }

  if (payload.command === "api.call") {
    if (payload.mode === "missing_api_key") {
      console.error(payload.message);
      console.error("Example: unisat-ai-cli api call --path \"/v1/price/btc\" --api-key YOUR_API_KEY");
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

  if (payload.command === "intro.list") {
    console.log(`results: ${payload.results.length}`);
    payload.results.forEach((item, index) => {
      console.log("");
      console.log(`${index + 1}. ${item.method.toUpperCase()} ${item.path}`);
      console.log(`domain: ${item.domain}`);
      console.log(`file: ${item.file}`);
      if (item.summary) {
        console.log(`summary: ${item.summary}`);
      }
    });
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

  if (payload.command === "intro.find") {
    console.log(`query: ${payload.query}`);
    console.log(`matches: ${payload.matches.length}`);
    payload.matches.forEach((item, index) => {
      console.log("");
      console.log(`${index + 1}. ${item.method.toUpperCase()} ${item.path}`);
      console.log(`domain: ${item.domain}`);
      console.log(`score: ${item.score}`);
      if (item.summary) {
        console.log(`summary: ${item.summary}`);
      }
      if (item.whyMatched) {
        console.log(`why: ${item.whyMatched}`);
      }
    });
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
        payload.match.conflictingSignals.forEach((item) => {
          console.log(`- ${item}`);
        });
      }
      if (payload.match.rankingNotes.length > 0) {
        console.log("notes:");
        payload.match.rankingNotes.forEach((item) => {
          console.log(`- ${item}`);
        });
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
      payload.match.whyMatched.forEach((item) => {
        console.log(`- ${item}`);
      });
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
    return;
  }

  if (payload.command === "intro.params") {
    if (payload.mode === "not_found") {
      console.log(`path not found: ${payload.path}`);
      return;
    }

    console.log(`${payload.method.toUpperCase()} ${payload.path}`);
    console.log(`domain: ${payload.domain}`);

    const groups = [
      ["pathParams", "path params"],
      ["queryParams", "query params"],
      ["headerParams", "header params"],
      ["cookieParams", "cookie params"],
    ];

    groups.forEach(([key, label]) => {
      if (payload[key].length === 0) {
        return;
      }
      console.log(`${label}:`);
      payload[key].forEach((item) => {
        console.log(
          `- ${item.name} (${item.required ? "required" : "optional"}, ${item.type || "unknown"})${item.description ? `: ${item.description}` : ""}`
        );
      });
    });

    if (payload.requestBodyTemplate) {
      console.log("request body:");
      console.log(JSON.stringify(payload.requestBodyTemplate, null, 2));
    }
    return;
  }

  if (payload.command === "intro.example") {
    if (payload.mode === "not_found") {
      console.log(`path not found: ${payload.path}`);
      return;
    }

    console.log(`${payload.method.toUpperCase()} ${payload.path}`);
    console.log(`domain: ${payload.domain}`);
    console.log(`shell: ${payload.shell}`);
    console.log("");
    console.log(payload.example);
    return;
  }

  if (payload.command === "intro.domains") {
    console.log(`domains: ${payload.results.length}`);
    payload.results.forEach((item, index) => {
      console.log(`${index + 1}. ${item}`);
    });
    return;
  }

  if (payload.command === "intro.related") {
    if (payload.mode === "not_found") {
      console.log(`path not found: ${payload.path}`);
      return;
    }

    console.log(`path: ${payload.path}`);
    console.log(`related: ${payload.results.length}`);
    payload.results.forEach((item, index) => {
      console.log("");
      console.log(`${index + 1}. ${item.method.toUpperCase()} ${item.path}`);
      console.log(`domain: ${item.domain}`);
      if (item.summary) {
        console.log(`summary: ${item.summary}`);
      }
    });
    return;
  }

  if (payload.command === "intro.guide") {
    console.log(payload.title);
    payload.steps.forEach((item) => {
      console.log("");
      console.log(`${item.step}. ${item.goal}`);
      console.log(item.command);
    });
    if (payload.notes.length > 0) {
      console.log("");
      console.log("notes:");
      payload.notes.forEach((item) => {
        console.log(`- ${item}`);
      });
    }
    return;
  }

  if (payload.command === "intro.capabilities") {
    console.log(`total operations: ${payload.totalOperations}`);
    console.log(`domains: ${payload.domains.length}`);
    payload.domains.forEach((item, index) => {
      console.log(`${index + 1}. ${item}`);
    });
    console.log("");
    console.log(`action tokens: ${payload.actions.length}`);
    console.log(payload.actions.join(", "));
    return;
  }

  if (payload.command === "intro.tasks") {
    console.log(`tasks: ${payload.tasks.length}`);
    payload.tasks.forEach((item, index) => {
      console.log("");
      console.log(`${index + 1}. ${item.name}`);
      console.log(`summary: ${item.summary}`);
      console.log(`query: ${item.query}`);
      console.log(`suggestedPath: ${item.suggestedPath}`);
    });
    return;
  }

  if (payload.command === "intro.task") {
    if (payload.mode === "not_found") {
      console.log(`task not found: ${payload.name}`);
      console.log(`available: ${payload.available.join(", ")}`);
      return;
    }

    console.log(payload.name);
    console.log(`summary: ${payload.summary}`);
    console.log(`query: ${payload.query}`);
    console.log(`suggestedPath: ${payload.suggestedPath}`);
    console.log("");
    console.log(`find: ${payload.discoveryCommand}`);
    console.log(`show: ${payload.showCommand}`);
    console.log(`params: ${payload.paramsCommand}`);
    console.log(`example: ${payload.exampleCommand}`);
  }
}

module.exports = {
  printOutput,
};
