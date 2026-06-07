import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const logRoot = path.join(repoRoot, "log");
const launchCwd = process.cwd();

function usage() {
  console.error("Usage: node scripts/run-with-log.mjs <category> <label> -- <command> [args...]");
}

function sanitizeSegment(value, fallback) {
  const sanitized = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!sanitized || sanitized === "." || sanitized === "..") return fallback;
  return sanitized;
}

function quoteCommand(parts) {
  return parts
    .map((part) => (/\s/.test(part) ? JSON.stringify(part) : part))
    .join(" ");
}

function closeStream(stream) {
  return new Promise((resolve) => {
    stream.end(resolve);
  });
}

const separatorIndex = process.argv.indexOf("--", 2);
const category = sanitizeSegment(process.argv[2], "misc");
const label = sanitizeSegment(process.argv[3], category);

if (separatorIndex < 0 || separatorIndex <= 3 || separatorIndex === process.argv.length - 1) {
  usage();
  process.exit(1);
}

const commandParts = process.argv.slice(separatorIndex + 1);
const [command, ...commandArgs] = commandParts;
const logDir = path.join(logRoot, category);
const resolvedLogDir = path.resolve(logDir);
const resolvedLogRoot = path.resolve(logRoot);

if (!resolvedLogDir.startsWith(`${resolvedLogRoot}${path.sep}`) && resolvedLogDir !== resolvedLogRoot) {
  console.error(`Refusing to write logs outside ${resolvedLogRoot}`);
  process.exit(1);
}

await mkdir(resolvedLogDir, { recursive: true });

const stdoutPath = path.join(resolvedLogDir, `${label}.log`);
const stderrPath = path.join(resolvedLogDir, `${label}.err.log`);
const stdoutLog = createWriteStream(stdoutPath, { flags: "a" });
const stderrLog = createWriteStream(stderrPath, { flags: "a" });
const sessionHeader = `\n[${new Date().toISOString()}] ${quoteCommand(commandParts)}\n# cwd ${path.relative(repoRoot, launchCwd) || "."}\n`;

stdoutLog.write(`${sessionHeader}# stdout\n`);
stderrLog.write(`${sessionHeader}# stderr\n`);

console.log(`[run-with-log] stdout -> ${path.relative(repoRoot, stdoutPath)}`);
console.log(`[run-with-log] stderr -> ${path.relative(repoRoot, stderrPath)}`);

const child = spawn(command, commandArgs, {
  cwd: launchCwd,
  env: process.env,
  shell: process.platform === "win32",
  stdio: ["inherit", "pipe", "pipe"]
});

child.stdout.on("data", (chunk) => {
  stdoutLog.write(chunk);
  process.stdout.write(chunk);
});

child.stderr.on("data", (chunk) => {
  stderrLog.write(chunk);
  process.stderr.write(chunk);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("error", async (error) => {
  const message = `[run-with-log] failed to start ${command}: ${error.message}\n`;
  stderrLog.write(message);
  process.stderr.write(message);
  await Promise.all([closeStream(stdoutLog), closeStream(stderrLog)]);
  process.exit(1);
});

child.on("close", async (code, signal) => {
  if (signal) {
    stderrLog.write(`[run-with-log] process terminated by ${signal}\n`);
  }
  await Promise.all([closeStream(stdoutLog), closeStream(stderrLog)]);
  process.exit(code ?? 1);
});
