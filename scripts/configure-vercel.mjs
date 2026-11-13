import fs from "node:fs";
export function configure(apiOrigin) {
  const url = new URL(apiOrigin);
  if (
    url.protocol !== "https:" ||
    url.origin !== apiOrigin ||
    url.username ||
    url.password
  )
    throw Error(
      "API origin must be an exact HTTPS origin, without credentials, path or trailing slash",
    );
  const path = new URL("../vercel.json", import.meta.url);
  const config = JSON.parse(fs.readFileSync(path, "utf8"));
  config.rewrites[0].destination = `${url.origin}/api/:path*`;
  return config;
}
if (process.argv[1]?.endsWith("/configure-vercel.mjs")) {
  const config = configure(process.env.PUBLIC_API_ORIGIN || "");
  fs.writeFileSync(
    new URL("../vercel.json", import.meta.url),
    JSON.stringify(config, null, 2) + "\n",
  );
  console.log(
    "Updated only the public API rewrite in vercel.json. Review and commit before importing into Vercel.",
  );
}
