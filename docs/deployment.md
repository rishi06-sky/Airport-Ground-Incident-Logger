# Deployment runbook — pending external hosting configuration

No hosting credentials, Atlas URI, real SMTP identity, or production DNS were supplied. No public deployment is claimed. Local builds, integration tests, and browser tests are the evidence currently available.

## 1. MongoDB Atlas

Create an Atlas replica-set-backed database, a least-privilege application database user, and a network allowlist for the API host. Store the `mongodb+srv://...` URI securely as `MONGODB_URI`; never put it in Git, frontend configuration, or chat. Enable backups. Transactions must be supported. The local unauthenticated Docker configuration is for loopback development only.

## 2. Private Flask service (Render persistent web/private service or equivalent)

- Root directory: `validation-service`.
- Python version: 3.12.
- Build: `pip install -r requirements.txt`.
- Start: `gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 30 app:app`.
- Set `SERVICE_TOKEN` to a generated shared internal secret.
- Mount a persistent disk at `/var/data`; set `VALIDATION_DB=/var/data/validation.sqlite`.
- Health path: `/health`. Restrict application access to the API/private network where supported. Use HTTPS if traffic traverses a public endpoint.
- Keep one SQLite service instance with a durable disk. For horizontal scaling, explicitly migrate the audit store to a durable shared database; multiple ephemeral SQLite copies are not an equivalent production deployment.

## 3. Express API service

- Build from repository root: `npm ci`.
- Start: `node backend/src/server.js`.
- Set `MONGODB_URI`, a random `JWT_SECRET` of at least 32 characters, the matching `SERVICE_TOKEN`, `VALIDATION_URL`, and platform `PORT`.
- Mount a persistent upload disk; set `UPLOAD_DIR=/var/data/uploads`.
- Set `TRUST_PROXY_HOPS=1` when the API is behind exactly one trusted hosting reverse proxy; use the actual trusted hop count for other topologies.
- Health path: `/api/health` checks MongoDB and Flask. A 503 means a required dependency is not healthy.
- Provision controlled production accounts before enabling staff access. For a private demonstration only, set a strong `DEMO_PASSWORD` and run `node backend/src/seed.js` once. Replace/disable demo accounts before public release; create real supervisors for the configured handlers.
- Optional SMTP: configure SMTP_HOST, SMTP_PORT (465 TLS or 587 STARTTLS), SMTP_USER, SMTP_PASS, SMTP_FROM securely. Without SMTP, persisted in-app safety delivery remains active. Check emailStatus separately from deliveryStatus.

## 4. Frontend on Vercel

- Install from repository root using `npm ci`.
- Build: `npm run build`; output directory `frontend/dist`.
- Use a same-origin `/api` proxy to the deployed API. A template is in `vercel.json`; replace `REPLACE-WITH-YOUR-API` with the actual backend hostname before deploying. It is intentionally not a fabricated deployment URL.
- Keep the catch-all SPA rewrite after the API rewrite so browser navigation works for incident details.
- `VITE_API_URL=/api` contains no secret. If deploying to another static host, configure the equivalent `/api/*` reverse proxy and SPA fallback; the API intentionally has no permissive cross-origin wildcard.

## 5. Release validation

1. Verify HTTPS, private Flask authentication, dependency health, and MongoDB indexes.
2. Sign in with each provisioned role; verify denied admin actions and report scoping.
3. Submit the documented fictional FOD report. Check DFA/regex, assignment, status transitions, capacity release, and dashboards.
4. Submit a safety example and inspect the officer's persisted notification. Test external SMTP delivery separately if configured.
5. Disable primary and backup handlers, submit normal and critical reports, re-enable capacity, and verify critical-first queue processing.
6. Restart services and database with durable storage; verify reports, uploads, audit links, and workloads survive.
7. Validate backups/restore, monitoring, retention policy, rate limits, attachment inspection, and operational governance before real use.

The provided tests are safe only against local or dedicated test databases. Never run the destructive integration suite or browser demo submissions against production.

Before production, keep ALLOW_SYNTHETIC_DEMO unset and NODE_ENV=production. Reset or separate any previously seeded demonstration database; guards do not hide existing rows. See [synthetic data lifecycle](synthetic-demonstration-data.md).

## Exact service settings for the first deployment

Create services only after reviewing the feature-branch pull request. The commands below describe configuration; publishing this repository does not create any of these services. Git contains application code, synthetic-data generation and verification evidence, not the current MongoDB/SQLite contents or the local `.env`.

### MongoDB Atlas

1. Create a replica-set-backed Atlas deployment in the same region as the Render services where possible. Use a separate database named `agil_production`.
2. Create an application database user with `readWrite` restricted to `agil_production`. Store its generated password only in the Render API service's secret environment settings.
3. Allow the API service's Render outbound IP ranges in Atlas Network Access. Do not use the local development unauthenticated MongoDB settings.
4. Configure the API's `MONGODB_URI` using Atlas's supplied connection string, with database path `/agil_production`, `retryWrites=true`, and `w=majority`. URL-encode any password characters as required. Never place this URI in Vercel or browser variables.
5. Enable backups appropriate to the selected Atlas tier. The API initializes indexes at startup; no manual collection import is required.

### Render Flask validation service

| Setting | Value |
|---|---|
| Type | Private Service, persistent-disk-capable paid plan |
| Name | `agil-validation` (use the assigned Internal Address below) |
| Repository | `rishi06-sky/Airport-Ground-Incident-Logger` |
| Branch | Reviewed release branch; normally `main` after merge |
| Root directory | `validation-service` |
| Runtime | Python |
| Build command | `pip install -r requirements.txt` |
| Start command | `gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 30 app:app` |
| Persistent disk mount | `/var/data` |
| Disk size | At least 1 GB; size and monitor for audit retention |
| Instance count | 1; do not horizontally replicate SQLite disks |

Environment variables:

```text
PYTHON_VERSION=3.12.14
PORT=10000
SERVICE_TOKEN=<generated-shared-secret>
VALIDATION_DB=/var/data/validation.sqlite
```

Use the **same** SERVICE_TOKEN in Express. Record the exact Internal Address shown by Render; set Express's VALIDATION_URL to that address with `http://` and its port, for example `http://<actual-validation-internal-host>:10000`. The placeholder is not an actual provisioned service. Keep both Render services in the same private network/region. `/health` is the validator readiness endpoint; private-service health configuration differs from public web-service HTTP health checks, so verify it from the API's private network.

The SQLite file, `-wal`, and `-shm` companions must live on the mounted disk. For a backup, use SQLite's online backup facility or stop writers and checkpoint before copying; do not copy only the live main file while ignoring an active WAL. Retain and test restoration of both Atlas and SQLite backups. Ephemeral Render/free-service storage is not suitable for this audit database.

### Render Express API

| Setting | Value |
|---|---|
| Type | Web Service, persistent-disk-capable paid plan |
| Name | `agil-api` (use Render's actual assigned public hostname) |
| Repository / branch | Same reviewed release as the validator |
| Root directory | Repository root (leave blank) |
| Runtime | Node |
| Build command | `npm ci` |
| Start command | `node backend/src/server.js` |
| HTTP health check | `/api/health` |
| Persistent disk mount | `/var/data` |
| Disk size | At least 1 GB, adjusted for uploaded attachments |

Environment variables:

```text
NODE_VERSION=24.22.1
NODE_ENV=production
PORT=10000
MONGODB_URI=<secret Atlas URI for agil_production>
JWT_SECRET=<independently generated random secret, at least 32 characters>
SERVICE_TOKEN=<same shared secret as Flask>
VALIDATION_URL=http://<actual-validation-internal-host>:10000
UPLOAD_DIR=/var/data/uploads
TRUST_PROXY_HOPS=1
ALLOW_SYNTHETIC_DEMO=false
```

TRUST_PROXY_HOPS=1 assumes the single Render ingress proxy; change it only to match the actual trusted topology. Do not set `VALIDATION_DB` on the API: Flask owns that storage. Do not run the local multi-process `scripts/start.mjs` on Render. Render manages the service processes separately.

Optional external mail variables (leave absent for persisted in-app notifications only): SMTP_HOST, SMTP_PORT (`465` for TLS or `587` for STARTTLS), SMTP_USER, SMTP_PASS, SMTP_FROM. SMTP_PASS is secret. Synthetic notification events are excluded from external mail delivery.

**Initial account provisioning:** the service does not auto-create production accounts. In a controlled Render shell, temporarily configure a strong secret DEMO_PASSWORD and run `node backend/src/seed.js` once to create routes and bootstrap accounts. Log in as the bootstrap administrator, provision a named real administrator and staff/handler/safety accounts, then log in as the new administrator and disable all four `@agil.test` bootstrap accounts. Remove DEMO_PASSWORD afterward. The API prevents an administrator from disabling its own account, so use the new administrator for that final step. This command does not insert synthetic reports. Never run `--incidents` or the destructive test suites against the production database.

### Vercel frontend

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Repository | `rishi06-sky/Airport-Ground-Incident-Logger` |
| Root directory | Repository root (`.`), preserving the workspace lockfile |
| Node.js version | 24.x |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `frontend/dist` |
| Environment variable | `VITE_API_URL=/api` |

Before deployment, replace only the placeholder backend hostname in the root `vercel.json` with the actual Render API hostname. Required rewrite order:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "frontend/dist",
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://<actual-render-api-hostname>/api/:path*"
    },
    { "source": "/:path*", "destination": "/index.html" }
  ]
}
```

Keep the API rewrite before the SPA fallback. The same-origin proxy avoids changing the existing API's CORS contract. Do not add JWT_SECRET, SERVICE_TOKEN, Atlas credentials, DEMO_PASSWORD, or SMTP credentials to Vercel/browser build variables. Actual service addresses and secret values become available only when those services are provisioned; no address in angle brackets is a claimed deployment URL.
