import { test } from "node:test";
import assert from "node:assert/strict";
import { configure } from "../../scripts/configure-vercel.mjs";
test("Vercel configuration retains API-first and SPA fallback ordering with a supplied public HTTPS API", () => {
  const c = configure("https://agil-api.example");
  assert.equal(
    c.rewrites[0].destination,
    "https://agil-api.example/api/:path*",
  );
  assert.equal(c.rewrites[1].destination, "/index.html");
  assert.equal(c.outputDirectory, "frontend/dist");
});
test("Vercel configuration rejects secret-bearing, non-HTTPS and ambiguous destinations", () => {
  for (const value of [
    "http://api.example",
    "https://user:secret@api.example",
    "https://api.example/",
    "https://api.example/path",
    "https://api.example?key=secret",
    "",
  ])
    assert.throws(() => configure(value));
});
import { validationUrl } from "./runtime-config.js";
test("Render service discovery resolves an internal host/port without leaking secrets into the URL", () => {
  assert.equal(
    validationUrl({
      NODE_ENV: "production",
      VALIDATION_HOST: "agil-validation.internal",
      VALIDATION_PORT: "10000",
    }),
    "http://agil-validation.internal:10000",
  );
  assert.equal(
    validationUrl({ VALIDATION_URL: "https://validator.example/" }),
    "https://validator.example",
  );
});
test("Production fails closed for missing validation destination and malformed origins", () => {
  for (const env of [
    { NODE_ENV: "production" },
    { VALIDATION_HOST: "user:secret@host" },
    { VALIDATION_HOST: "host", VALIDATION_PORT: "0" },
    { VALIDATION_URL: "file:///etc/passwd" },
    { VALIDATION_URL: "https://user:secret@host" },
  ])
    assert.throws(() => validationUrl(env));
});
