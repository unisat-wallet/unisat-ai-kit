import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendorDir = path.join(rootDir, "packages", "cli", "vendor");

fs.rmSync(vendorDir, { recursive: true, force: true });
