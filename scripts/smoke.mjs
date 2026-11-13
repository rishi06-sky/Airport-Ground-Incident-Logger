const base = "http://127.0.0.1:3001/api";
const health = await fetch(`${base}/health`);
if (!health.ok) throw Error("Dependency health failed");
const login = await fetch(`${base}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "admin@agil.test",
    password: process.env.DEMO_PASSWORD,
  }),
});
if (!login.ok) throw Error("Controlled demo account login failed");
const { token } = await login.json();
for (const path of [
  "/auth/me",
  "/routing",
  "/handlers",
  "/dashboard/summary",
]) {
  const response = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw Error(`Functional smoke check failed: ${path}`);
  const data = await response.json();
  if (path === "/auth/me" && data.role !== "admin")
    throw Error("Unexpected user role");
  if (["/routing", "/handlers"].includes(path) && data.length !== 5)
    throw Error("Expected five configured demonstration teams/routes");
  if (path === "/dashboard/summary" && typeof data.total !== "number")
    throw Error("Missing persisted dashboard summary");
}
console.log(
  "PASS: dependencies, controlled login, user identity, five routes/teams, and stored-data dashboard API.",
);
