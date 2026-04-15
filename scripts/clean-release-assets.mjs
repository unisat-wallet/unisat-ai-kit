import fs from "fs";
import path from "path";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const vendorDir = path.join(rootDir, "packages", "cli", "vendor");

fs.rmSync(vendorDir, { recursive: true, force: true });
