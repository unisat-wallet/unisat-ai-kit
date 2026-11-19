import path from "node:path";
import { fileURLToPath } from "node:url";

// Deterministic request contracts for tests only. Production uses the remote cache.
export const testSwaggerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../tests/fixtures/openapi-swagger");
process.env.OPENAPI_SWAGGER_DIR = testSwaggerDir;
