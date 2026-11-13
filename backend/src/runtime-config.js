export function validationUrl(env) {
  if (env.VALIDATION_URL) {
    const url = new URL(env.VALIDATION_URL);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw Error(
        "VALIDATION_URL must be a service origin without credentials or paths",
      );
    return url.origin;
  }
  if (env.VALIDATION_HOST) {
    if (!/^[a-zA-Z0-9.-]+$/.test(env.VALIDATION_HOST))
      throw Error("VALIDATION_HOST must be a bare internal hostname");
    const port = Number(env.VALIDATION_PORT || 10000);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw Error("Invalid VALIDATION_PORT");
    return `http://${env.VALIDATION_HOST}:${port}`;
  }
  if (env.NODE_ENV === "production")
    throw Error("Production requires VALIDATION_URL or VALIDATION_HOST");
  return "http://127.0.0.1:5001";
}
