import dotenv from "dotenv";
import { spawn } from "node:child_process";
import fs from "node:fs";
dotenv.config({ quiet: true });
const root = process.cwd();
fs.mkdirSync(".data", { recursive: true });
const jobs = [
  [
    "validation",
    `${root}/.venv/bin/python`,
    ["app.py"],
    `${root}/validation-service`,
    { PORT: "5001" },
  ],
  ["api", "node", ["src/server.js"], `${root}/backend`, {}],
  ["web", "npm", ["run", "dev", "-w", "frontend"], root, {}],
];
const children = jobs.map(([name, cmd, args, cwd, env]) => {
  const log = fs.openSync(`${root}/.data/${name}.log`, "a");
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.on("exit", (code) => {
    if (code && !stopping) {
      console.error(`${name} exited ${code}; see .data/${name}.log`);
      shutdown();
    }
  });
  return child;
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const p of children) {
    try {
      process.kill(-p.pid, "SIGTERM");
    } catch {}
  }
}
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, shutdown);
for (let n = 0; n < 60; n++) {
  try {
    const [api, web] = await Promise.all([
      fetch("http://127.0.0.1:3001/api/health"),
      fetch("http://127.0.0.1:5173"),
    ]);
    if (api.ok && web.ok) {
      console.log(
        "AGIL services ready: API health and web response verified. Logs: .data/*.log",
      );
      break;
    }
  } catch {}
  if (n === 59) {
    console.error("Readiness timed out; inspect .data/*.log");
    shutdown();
    process.exitCode = 1;
  }
  await new Promise((r) => setTimeout(r, 500));
}
