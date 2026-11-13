// Read-only checks after the user has approved and created hosting resources.
export async function verifyPublic(frontend, api) {
  for (const value of [frontend, api]) {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.origin !== value ||
      url.username ||
      url.password
    )
      throw Error(
        "Use exact public HTTPS origins without paths, credentials or trailing slashes",
      );
  }
  async function get(url) {
    return fetch(url, {
      signal: AbortSignal.timeout(20000),
      redirect: "follow",
    });
  }
  for (const path of ["/", "/reports"]) {
    const response = await get(frontend + path);
    const body = await response.text();
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("text/html") ||
      !body.includes('id="root"') ||
      body.includes("/@vite/client")
    )
      throw Error(`Frontend/SPA check failed: ${path}`);
  }
  for (const origin of [api, frontend]) {
    const r = await get(origin + "/api/health");
    const data = await r.json();
    if (
      !r.ok ||
      data.status !== "ok" ||
      data.mongo !== true ||
      data.validation !== true
    )
      throw Error("API/validator/Atlas health or frontend API rewrite failed");
    const protectedResponse = await get(origin + "/api/incidents");
    if (protectedResponse.status !== 401)
      throw Error(
        "Protected incident endpoint must deny unauthenticated requests",
      );
  }
  console.log(
    "PASS: public HTTPS frontend, SPA fallback, Render/Atlas/validator health, Vercel API rewrite and unauthenticated access checks. Authenticated end-to-end release validation still requires a controlled test account.",
  );
}
if (process.argv[1]?.endsWith("/verify-public.mjs"))
  await verifyPublic(
    process.env.FRONTEND_PUBLIC_URL,
    process.env.API_PUBLIC_URL,
  );
