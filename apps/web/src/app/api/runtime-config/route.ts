import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function readRootEnvValue(name: string) {
  const direct = process.env[name];
  if (direct) return direct;

  const envPath = path.resolve(process.cwd(), "../../.env");
  if (!fs.existsSync(envPath)) return "";

  const content = fs.readFileSync(envPath, "utf8");
  const line = content.split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  if (!line) return "";

  return line.slice(name.length + 1).trim();
}

export function GET() {
  const amapJsapiKey = readRootEnvValue("NEXT_PUBLIC_AMAP_JSAPI_KEY");
  const amapSecurityJsCode = readRootEnvValue("NEXT_PUBLIC_AMAP_SECURITY_JS_CODE");

  return NextResponse.json(
    {
      amapJsapiKey,
      amapSecurityJsCode,
      hasAmapKey: amapJsapiKey.length > 0,
      hasAmapSecurityJsCode: amapSecurityJsCode.length > 0
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
