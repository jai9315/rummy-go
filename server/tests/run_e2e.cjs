#!/usr/bin/env node
/**
 * Self-contained E2E runner for server/tests/phase3_e2e.test.cjs.
 * Spawns the built backend server against an isolated temp SQLite database,
 * waits for /api/health, executes the E2E suite, and guarantees deterministic
 * shutdown with zero lingering processes.
 */

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "../..");
const SERVER_ENTRY = path.join(ROOT_DIR, "server", "dist", "index.js");
const E2E_TEST_FILE = path.join(ROOT_DIR, "server", "tests", "phase3_e2e.test.cjs");
const PORT = 4000;

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: "127.0.0.1", port: PORT, path: "/api/health", timeout: 1500 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(serverProc, stderrBuf, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (serverProc.exitCode !== null) {
      throw new Error(
        `Backend server exited prematurely with code ${serverProc.exitCode}:\n${stderrBuf.join("")}`
      );
    }
    if (await checkHealth()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for backend server health check on port ${PORT}`);
}

async function stopProcess(proc) {
  if (!proc || proc.exitCode !== null) return;
  await new Promise((resolve) => {
    const killTimer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
    }, 4000);

    proc.once("exit", () => {
      clearTimeout(killTimer);
      resolve();
    });

    try {
      proc.kill("SIGTERM");
    } catch {
      clearTimeout(killTimer);
      resolve();
    }
  });
}

async function main() {
  if (!fs.existsSync(SERVER_ENTRY)) {
    console.error(`Missing compiled server at ${SERVER_ENTRY}. Run "npm run build:server" first.`);
    process.exit(1);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rummy-e2e-runner-"));
  const dbPath = path.join(tempDir, "e2e.db");
  const stderrBuf = [];

  const serverProc = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: "test",
      DATABASE_URL: `file:${dbPath}`,
      CLIENT_URL: "http://localhost:3000",
      JWT_SECRET: "rummy_e2e_runner_secret_key_32chars_min",
      LIVEKIT_API_KEY: "devkey",
      LIVEKIT_API_SECRET: "secret_for_rummy_e2e_runner_32chars",
      LIVEKIT_URL: "ws://localhost:7880",
      TOSS_DURATION_MS: "150",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProc.stderr.on("data", (chunk) => stderrBuf.push(chunk.toString()));

  const cleanup = async () => {
    await stopProcess(serverProc);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {}
  };

  let interrupted = false;
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, async () => {
      if (interrupted) return;
      interrupted = true;
      await cleanup();
      process.exit(130);
    });
  }

  let testExitCode = 1;
  try {
    await waitForServer(serverProc, stderrBuf);

    testExitCode = await new Promise((resolve, reject) => {
      const testProc = spawn(process.execPath, ["--test", E2E_TEST_FILE], {
        cwd: ROOT_DIR,
        env: process.env,
        stdio: "inherit",
      });
      testProc.on("error", reject);
      testProc.on("exit", (code) => resolve(code ?? 1));
    });
  } finally {
    await cleanup();
  }

  process.exit(testExitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
