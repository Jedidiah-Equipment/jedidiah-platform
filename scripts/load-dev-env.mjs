import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const devEnvPath = fileURLToPath(new URL("../.dev.env", import.meta.url));

config({
  path: devEnvPath,
  override: false,
  quiet: true,
});
