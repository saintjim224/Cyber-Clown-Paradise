import env from "@next/env";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { loadEnvConfig } = env;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadEnvConfig(repoRoot);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@cyberjoker/shared"],
  env: {
    NEXT_PUBLIC_AMAP_JSAPI_KEY: process.env.NEXT_PUBLIC_AMAP_JSAPI_KEY ?? "",
    NEXT_PUBLIC_AMAP_SECURITY_JS_CODE: process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE ?? "",
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000",
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? ""
  },
  eslint: {
    ignoreDuringBuilds: true
  }
};

export default nextConfig;
