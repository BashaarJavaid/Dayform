// Local runs read the repo's .env.local (git-ignored), like the server's main.ts. The Lambda gets its env from T-40.
import { fileURLToPath } from "node:url";
try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env.local", import.meta.url)));
} catch {}
