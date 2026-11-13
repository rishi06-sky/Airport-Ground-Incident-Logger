import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { cors } from "./cors.js";
const server = (origins) => {
  const app = express();
  app.use(cors(origins));
  app.get("/api/check", (req, res) => res.json({ ok: true }));
  return app;
};
test("CORS permits an exact configured Vercel origin and JWT preflight headers", async () => {
  const app = server("https://agil.example,https://preview.example");
  const response = await request(app)
    .options("/api/check")
    .set("Origin", "https://agil.example")
    .set("Access-Control-Request-Method", "POST")
    .set("Access-Control-Request-Headers", "authorization,idempotency-key");
  assert.equal(response.status, 204);
  assert.equal(
    response.headers["access-control-allow-origin"],
    "https://agil.example",
  );
  assert.match(
    response.headers["access-control-allow-headers"],
    /Idempotency-Key/,
  );
  assert.match(response.headers.vary, /Origin/);
  assert.equal(response.headers["access-control-allow-credentials"], undefined);
});
test("CORS rejects unlisted origins including hostname suffix attacks", async () => {
  for (const origin of [
    "https://evil.example",
    "https://agil.example.evil.example",
  ])
    assert.equal(
      (
        await request(server("https://agil.example"))
          .get("/api/check")
          .set("Origin", origin)
      ).status,
      403,
    );
});
test("CORS defaults to same-origin proxy without a wildcard and permits internal health requests", async () => {
  const response = await request(server(""))
    .get("/api/check")
    .set("Origin", "http://localhost:5173");
  assert.equal(response.status, 200);
  assert.equal(response.headers["access-control-allow-origin"], undefined);
  assert.equal(
    (await request(server("https://agil.example")).get("/api/check")).status,
    200,
  );
});
test("CORS fails startup for wildcard, path, userinfo and malformed allowlist entries", () => {
  for (const value of [
    "*",
    "https://agil.example/",
    "https://user:pass@agil.example",
    "not-a-url",
  ])
    assert.throws(() => cors(value));
});
