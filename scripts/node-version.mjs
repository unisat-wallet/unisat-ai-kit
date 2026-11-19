import fs from "fs";

const { engines } = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export function assertSupportedNode(version = process.versions.node) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Invalid Node.js release version: ${version}`);
  }
  const [major, minor, patch] = version.split(".").map(Number);
  const supported = engines.node.split(" || ").some((range) => {
    const [requiredMajor, requiredMinor, requiredPatch] = range.slice(1).split(".").map(Number);
    return major === requiredMajor &&
      (minor > requiredMinor || (minor === requiredMinor && patch >= requiredPatch));
  });
  if (!supported) {
    throw new Error(`Node.js ${version} is unsupported; required: ${engines.node}. Use the version in .nvmrc.`);
  }
}
