// Run the existing browser suite without adding records to the application database.
import "dotenv/config";
import mongoose from "mongoose";
import { seed } from "../backend/src/seed.js";
import { spawn } from "node:child_process";
import fs from "node:fs";
const root = process.cwd(),
  uri =
    process.env.BROWSER_TEST_MONGODB_URI ||
    "mongodb://127.0.0.1:27017/agil_browser_test?replicaSet=agil";
await mongoose.connect(uri);
if (!mongoose.connection.name.endsWith("_test"))
  throw Error("Browser test database must end in _test");
await mongoose.connection.dropDatabase();
await seed(process.env.DEMO_PASSWORD);
await mongoose.disconnect();
fs.mkdirSync(".data", { recursive: true });
fs.writeFileSync(
  ".data/browser-vite.config.mjs",
  `import config from '../frontend/vite.config.js';export default {...config,root:${JSON.stringify(root + "/frontend")},server:{host:'127.0.0.1',port:5174,strictPort:true,proxy:{'/api':'http://127.0.0.1:3003'}}};`,
);
const children = [];
function launch(name, cmd, args, env = {}, cwd = root) {
  const fd = fs.openSync(`.data/browser-${name}.log`, "w");
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ["ignore", fd, fd],
  });
  children.push(child);
  return child;
}
try {
  launch(
    "validation",
    `${root}/.venv/bin/python`,
    ["app.py"],
    { PORT: "5098", VALIDATION_DB: `${root}/.data/browser-validation.sqlite` },
    `${root}/validation-service`,
  );
  launch("api", "node", ["backend/src/server.js"], {
    PORT: "3003",
    MONGODB_URI: uri,
    VALIDATION_URL: "http://127.0.0.1:5098",
    UPLOAD_DIR: `${root}/.data/browser-uploads`,
  });
  launch("web", "node", [
    "node_modules/vite/bin/vite.js",
    "--config",
    ".data/browser-vite.config.mjs",
  ]);
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try {
      const [a, w] = await Promise.all([
        fetch("http://127.0.0.1:3003/api/health"),
        fetch("http://127.0.0.1:5174"),
      ]);
      if (a.ok && w.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!ready)
    throw Error(
      "Isolated browser services failed; inspect .data/browser-*.log",
    );
  const runner = spawn("npx", ["playwright", "test"], {
    env: { ...process.env, E2E_BASE_URL: "http://127.0.0.1:5174" },
    stdio: "inherit",
  });
  const code = await new Promise((resolve, reject) => {
    runner.once("exit", resolve);
    runner.once("error", reject);
  });
  if (code !== 0) throw Error(`Playwright exited ${code}`);
} finally {
  for (const child of children) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
}
