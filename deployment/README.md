# Public deployment checklist — user approval required

Configuration is prepared in Git; no hosting resources or public deployment are created by these files. `render.yaml` is a **paid-plan proposal**. Review the actual Render account pricing before applying it. Auto-deploy is disabled for both services. Do not connect production auto-deployment to the feature branch.

## 1. Choose durable audit storage before provisioning

| Option | Cost/behavior | Application changes |
|---|---|---|
| Render persistent disk (proposed blueprint) | Paid service plus disk; one Flask instance; audit file survives service restarts and redeploys, but not deliberate disk deletion | Preserves SQLite and current audit design |
| Shared durable audit database | Managed database cost; supports multiple validator instances | Requires a separately reviewed audit-store migration and recovery/reconciliation tests |
| Ephemeral/free-service filesystem | Loses records on replacement/redeploy | **Does not meet durable audit requirements** |

The supplied proposal has two Starter services and two 1 GB persistent disks: SQLite for Flask and attachments for Express. It creates no resources until you apply it in Render. If you prefer a shared audit database, do not apply the blueprint; request that migration first. A local disk backup is not protection from disk/account loss; keep encrypted, access-controlled off-host copies and test restores.

## 2. Create MongoDB Atlas

1. Sign in to Atlas and create/select a project and a replica-set-backed cluster. Select a region near the Render services (the proposal uses Singapore).
2. Create database `agil_production` and a dedicated database user with `readWrite` on that database only. Save its password securely.
3. Obtain the Node connection string, set its database to `agil_production`, and URL-encode password characters where needed. Keep `retryWrites=true&w=majority`.
4. After Render supplies the API service's outbound IP ranges, allow those ranges in Atlas Network Access. Do not expose Atlas to every IP merely to work around missing configuration.
5. Set up backups supported by your chosen tier. Do not import the local test database or commit database dumps.

**Your action:** create the Atlas resources, enter the URI securely in Render, approve the network rules and any Atlas charges. Never paste passwords into chat or Git.

## 3. Review and apply the Render blueprint

1. Sign in to Render and connect GitHub with access to `rishi06-sky/Airport-Ground-Incident-Logger`.
2. Review/merge the deployment feature branch first, or select that branch explicitly for a controlled preview. Verify the intended Git commit.
3. Open **New → Blueprint**, select the repository and branch containing `render.yaml`, and review the two paid services/disks. Do not click Apply until you accept the costs.
4. Enter `MONGODB_URI` as a secret at the prompt. The blueprint generates JWT_SECRET and one shared SERVICE_TOKEN environment group; do not generate different service tokens independently.
5. Both services use Singapore. The validator is private, uses one Gunicorn worker with four threads, and listens on port 10000. Flask stores SQLite at `/var/data/validation.sqlite` on its disk.
6. Render injects the validator's actual internal hostname into the API's VALIDATION_HOST. The application constructs the internal HTTP URL with VALIDATION_PORT=10000. If configuring manually, use the templates beside this README and the settings in `docs/deployment.md`.
7. Express listens on port 10000, stores attachments under `/var/data/uploads`, and checks MongoDB and Flask at `/api/health`. Flask's `/health` checks an actual committed SQLite write. Verify validator health from the Render private network; its private hostname is not a public browser URL.
8. Keep ALLOW_SYNTHETIC_DEMO=false and NODE_ENV=production. Production seeding/reset of synthetic incidents is blocked. Keep optional SMTP credentials unset until an authorized mail identity and delivery test are available.

**Your action:** approve creation and paid storage, supply Atlas credentials securely, apply the configuration, and inspect Render logs/health. This is the first actual deployment action and has not been performed by Codex.

## 4. Provision controlled accounts

In a controlled Render API shell, temporarily supply a strong secret DEMO_PASSWORD and run `node backend/src/seed.js` to initialize routes and bootstrap accounts (no synthetic reports). Sign in as the bootstrap administrator, provision a named real administrator, then sign in as that new administrator and disable the four `@agil.test` accounts. Remove DEMO_PASSWORD from Render afterward. Provision staff, safety officers and supervisors with the proper handler IDs. Do not run tests or `--incidents` against `agil_production`.

The current 105 local reports stay in the development database. Git contains synthetic generation code and evidence, not a production data export.

## 5. Configure the frontend only after the API hostname exists

1. Copy the actual public API HTTPS origin from Render; do not guess its hostname.
2. In the repository root run:

   ```bash
   PUBLIC_API_ORIGIN=https://ACTUAL-RENDER-API-HOST node scripts/configure-vercel.mjs
   ```

   Replace the example hostname with the real one. The script refuses credentials, paths, query strings, trailing slashes and non-HTTPS URLs. It changes only the API destination in `vercel.json`. Review/commit/push that change before importing into Vercel: Vercel reads rewrites before the build, so a build-time environment variable alone cannot replace this route.
3. Sign in to Vercel, import the GitHub repository, and choose the reviewed branch. Framework: Vite; root: repository root; Node: 24.x; install: `npm ci`; build: `npm run build`; output: `frontend/dist`; env: VITE_API_URL=/api.
4. The `/api/:path*` rewrite must precede `/:path* → /index.html`. No backend secret belongs in Vercel or a VITE_ variable.
5. Review and approve the Vercel deployment. Record its actual HTTPS origin.

**CORS:** default requests use Vercel's same-origin `/api` proxy, which needs no permissive wildcard. For direct browser-to-Render API access, set CORS_ORIGINS on Render to the exact Vercel origin, for example `https://actual-project.vercel.app`, and list explicitly approved preview/custom origins separated by commas. Do not use `*` or trailing slashes. Allowed preflights cover Authorization, Content-Type and Idempotency-Key. JWT/RBAC still apply; CORS is not authorization. No cookie credentials are enabled. A configured unlisted Origin receives 403; requests without Origin remain available for internal health/service requests.

## 6. Verify actual public URLs before calling the release successful

After you approve deployments, run:

```bash
FRONTEND_PUBLIC_URL=https://ACTUAL-VERCEL-HOST \
API_PUBLIC_URL=https://ACTUAL-RENDER-API-HOST \
node scripts/verify-public.mjs
```

This performs read-only HTTPS/SPA/API-rewrite/dependency-health/unauthenticated-access checks. Then test a controlled authenticated workflow in a dedicated staging database/account: login, DFA validation, submission, dispatch, transitions, safety inbox, capacity release, attachments and role isolation. Confirm records survive a controlled service restart and audit-disk remount. Neither local tests nor a build proves public deployment success. No public URL has been supplied or tested yet.

## 7. Back up and restore SQLite

On the validator service, use Python's SQLite backup API (works with committed WAL content):

```bash
python backup_audit.py /var/data/backups/validation-UNIQUE-TIMESTAMP.sqlite
```

Choose a new filename for each run. The helper refuses to overwrite the live database or an existing backup and runs an integrity check. Transfer the snapshot to protected off-host storage; a backup on the same disk alone is insufficient. Restore during controlled maintenance with writers stopped, validate `PRAGMA integrity_check`, verify expected audit counts/correlations, and retain the previous database for rollback. Do not raw-copy a live main SQLite file while ignoring its WAL. Keep one validator instance for this design.
