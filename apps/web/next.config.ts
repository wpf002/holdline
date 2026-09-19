import { config } from "dotenv";
import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

// Every app reads the repo-root .env (see .env.example); Next only loads apps/web/.env* on its own.
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

const nextConfig: NextConfig = { transpilePackages: ["@holdline/types"] };
export default nextConfig;
