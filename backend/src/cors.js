// JWT remains mandatory. CORS only controls browser access, never authorization.
export function cors(origins = "") {
  const allowed = new Set(
    origins
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  for (const origin of allowed) {
    const url = new URL(origin);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.origin !== origin ||
      url.username ||
      url.password
    )
      throw Error(
        "CORS_ORIGINS must contain exact HTTP(S) origins without paths or trailing slashes",
      );
  }
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (!origin || !allowed.size) return next(); // Default: same-origin proxy; no CORS grant.
    res.vary("Origin");
    if (!allowed.has(origin))
      return res
        .status(403)
        .json({
          error: "Browser origin is not allowed",
          requestId: req.requestId,
        });
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Expose-Headers", "X-Request-ID");
    if (req.method === "OPTIONS") {
      res.set(
        "Access-Control-Allow-Methods",
        "GET,HEAD,POST,PUT,PATCH,OPTIONS",
      );
      res.set(
        "Access-Control-Allow-Headers",
        "Authorization,Content-Type,Idempotency-Key,X-Request-ID",
      );
      res.set("Access-Control-Max-Age", "600");
      return res.status(204).end();
    }
    next();
  };
}
