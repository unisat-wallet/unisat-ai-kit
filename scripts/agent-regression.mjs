import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plan = JSON.parse(fs.readFileSync(path.join(root, "tests/agent-regression/plan.json"), "utf8"));
if (/\?{3,}|\uFFFD/.test(JSON.stringify(plan))) {
  throw new Error("Test plan contains corrupted text; restore UTF-8 content before evaluation.");
}
const ids = new Set();
for (const item of plan.cases) {
  if (!item.id || ids.has(item.id) || !item.prompt || !item.checks.length || !item.inputs.length
      || !["live-readonly", "isolated"].includes(item.tier) || !Number.isInteger(item.repeats) || item.repeats < 1) {
    throw new Error(`Invalid regression case: ${item.id}`);
  }
  ids.add(item.id);
  if (!["cli", "mcp"].includes(item.transport) || typeof item.artifactWork !== "boolean"
      || !["toolCalls", "maxMinutes", "maxOutputTokensPerCall"].every(key => Number.isInteger(item.budget?.[key]) && item.budget[key] > 0)) {
    throw new Error(`Invalid execution metadata: ${item.id}`);
  }
  for (const [, name] of item.prompt.matchAll(/\{\{(\w+)\}\}/g)) {
    if (!item.inputs.includes(name)) throw new Error(`Undeclared input: ${item.id}.${name}`);
  }
  const stages = item.hostOnly?.stages || [];
  const stageIds = new Set();
  for (const stage of stages) {
    if (!stage.id || stageIds.has(stage.id) || typeof stage.required !== "boolean" || !stage.success
      || !Array.isArray(stage.dependsOn) || stage.dependsOn.some(id => !stageIds.has(id))) {
      throw new Error(`Invalid stage or dependency order: ${item.id}.${stage.id}`);
    }
    stageIds.add(stage.id);
  }
  const variantIds = new Set();
  for (const variant of item.hostOnly?.variants || []) {
    if (!variant.id || variantIds.has(variant.id) || !variant.scope
      || !["supported-extension", "unsupported-boundary"].includes(variant.kind)) {
      throw new Error(`Invalid variant: ${item.id}.${variant.id}`);
    }
    variantIds.add(variant.id);
  }
}
function git(args) {
  try { return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return "unknown"; }
}
const report = {
  schemaVersion: 3, planVersion: plan.version, startedAt: new Date().toISOString(),
  commit: git(["rev-parse", "HEAD"]), workingTree: git(["status", "--short"]),
  runtime: process.version, platform: process.platform,
  scope: "Deterministic baseline plus pending real-agent evaluations; not a financial safety certification",
  baseline: [], overall: "pending_agent_evaluation",
  budgetRules: plan.budgetRules,
  evaluationRules: plan.evaluationRules,
  cases: plan.cases.flatMap(item => Array.from({ length: item.repeats }, (_, index) => ({
    id: item.id, repetition: index + 1, tier: item.tier, status: "pending",
    promptTemplate: item.prompt, inputs: Object.fromEntries(item.inputs.map(name => [name, null])),
    checks: item.checks.map(check => ({ check, status: "pending", evidence: null })),
    model: null, transport: item.transport || "cli", launcher: null, fixture: null,
    budget: item.budget, artifactWork: item.artifactWork === true,
    preflight: { capability: "pending", inputs: "pending", infrastructure: "pending" },
    hostOnly: item.hostOnly || null,
    stages: (item.hostOnly?.stages || []).map(stage => ({ ...stage, status: "pending", evidence: null, failureCategory: null })),
    failureCategory: null,
    counters: { toolCalls: 0, upstreamRequests: 0, developmentCommands: 0, environmentLaunchFailures: 0 },
    assessment: { taskCompletion: "pending", dataCorrectness: "pending", safety: "pending", efficiency: "pending" },
    commands: [], requestLedger: null, findings: [], hardFailures: [],
  }))),
};
// These suites replace fetch with fixtures and never need production credentials.
for (const [name, modulePath, entry] of [
  ["regression", "./regression-checks.mjs", "runRegressionChecks"],
  ["agent-contract", "./agent-checks.mjs", "runAgentChecks"],
]) {
  try {
    const module = await import(modulePath);
    await module[entry]();
    report.baseline.push({ name, status: "passed" });
    console.log(`PASS ${name}`);
  } catch (error) {
    // Do not serialize arbitrary exception text: failures may include request data.
    report.baseline.push({ name, status: "failed", errorType: error.name });
    console.error(`FAIL ${name} (${error.name}); run its underlying suite to investigate locally.`);
    process.exitCode = 1;
  }
}
if (process.exitCode) report.overall = "failed";
report.finishedAt = new Date().toISOString();
const directory = path.join(root, ".agent-test-results");
fs.mkdirSync(directory, { recursive: true });
const target = path.join(directory, `${report.startedAt.replace(/[:.]/g, "-")}-${process.pid}.json`);
fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Report: ${target}`);
console.log(`Real-agent evaluations: ${report.cases.length} pending. Exit 0 means baseline passed ONLY.`);
