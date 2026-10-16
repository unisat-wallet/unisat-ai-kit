const SUCCESS_MODES = new Set(["detail", "plan", "list", "saved", "help", "version"]);
const NEXT_ACTIONS = {
  missing_api_key: "Ask the user to configure the selected environment's API key. Run config status --format json to inspect local configuration.",
  api_key_error: "Check the selected network and API key. Ask the user to replace an invalid key; do not repeatedly retry.",
  forbidden: "Check this key's permissions and selected network with the user; retrying unchanged will not fix access.",
  rate_limited: "Wait for Retry-After when provided, then retry only if retryable is true.",
  confirmation_required: "Obtain explicit user authorization for this operation before supplying --confirm. Do not add it just to clear this error.",
  missing_path_params: "Supply the missing --path-param name=value entries, then run --dry-run.",
  missing_query_params: "Supply the missing --query-param name=value entries, then run --dry-run.",
  missing_required_params: "Read the command's --help, supply the missing parameters, then run --dry-run.",
  missing_body: "Read the command's --help and provide the required --body JSON.",
  invalid_body: "Correct --body JSON and shell quoting, then run --dry-run.",
  invalid_parameters: "Check path and query parameters, including percent encoding, then run --dry-run.",
  invalid_environment: "Use --env bitcoin or --env fractal; only these mainnets are supported.",
  not_found: "Run commands --format json to find an exact path supported by this CLI version.",
  unknown_command: "Run --help or commands --format json to discover supported commands.",
  api_error: "Inspect response.body.code and response.body.msg; correct the business request before retrying.",
};

function withRecovery(payload) {
  if (SUCCESS_MODES.has(payload.mode)) return payload;
  const safeToRetry = payload.safety ? payload.safety.readOnly === true : String(payload.method).toLowerCase() === "get";
  const transient = ["network_error", "timeout", "rate_limited"].includes(payload.mode)
    || (payload.mode === "http_error" && payload.response?.status >= 500);
  const retryable = payload.retryable ?? (safeToRetry && transient);
  const uncertainWrite = !safeToRetry && (transient || payload.mode === "invalid_response");
  const proxyFailure = payload.mode === "network_error" && payload.network?.viaProxy;
  return {
    ...payload,
    retryable: proxyFailure ? false : retryable,
    nextAction: uncertainWrite
      ? "The operation may have reached the server. Query its status before resubmitting; do not automatically retry."
      : payload.nextAction || (proxyFailure ? "Check HTTP_PROXY, HTTPS_PROXY, NO_PROXY and proxy availability/authentication. Fix the proxy before retrying; no direct fallback was attempted." : NEXT_ACTIONS[payload.mode])
        || (retryable ? "Retry with bounded backoff; stop and report if the failure persists." : "Review the error and command --help before retrying."),
  };
}

module.exports = { withRecovery };
