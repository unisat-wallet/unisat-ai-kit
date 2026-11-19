import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendorDir = path.join(rootDir, "packages", "cli", "vendor");

function removeWithRetry(targetPath, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (error) {
      if (attempt === attempts || error.code !== "ENOTEMPTY") {
        throw error;
      }
    }
  }
}

removeWithRetry(vendorDir);
