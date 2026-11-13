# Synthetic incident demonstration dataset

The original base seeder is unchanged in purpose: without flags it provisions fictional users, five teams, and routing rules using `$setOnInsert`. It does not insert reports. Synthetic incidents are an explicit, development-only opt-in.

## Seed 100 reports

From the repository root, with MongoDB and the Python validator running and the existing accounts/routes provisioned:

```bash
ALLOW_SYNTHETIC_DEMO=true node --env-file=.env backend/src/seed.js --incidents
```

The command prints generated count, total dataset count, and actual category/priority/status/zone/notification distributions. Run the same command again: `generated` is zero and the existing 100 reports remain unchanged. The dataset identity is `agil-synthetic-v1`; keys are deterministic and scoped to a persistent reporter identity. A MongoDB lease prevents simultaneous seed/reset commands. Partial runs can resume without duplicate report IDs or assignments. If a completed dataset has been manually removed in part, the seeder refuses to silently overwrite user changes; use the explicit reset first.

No dependency or HTTP API contract was added. The seeder starts a short-lived, authenticated Express listener on a random loopback port and calls the existing validation, submission, and status endpoints. The normal application server need not be restarted or replaced to seed. It uses the existing demo staff user as reporter when active (otherwise the existing administrator) and an existing administrator for status processing. No accounts, routes, availability settings, backups, or capacities are overwritten.

All 100 scenarios are preflighted against the real Flask validator in read-only mode. Customized rules which reject these scenarios cause a clear failure rather than changing configuration or hardcoding a classification. Existing non-synthetic Pending incidents also cause a refusal, since automatically draining them would modify pre-existing reports. Restore eligible capacity or process existing pending work through the application before retrying.

## Distribution and consistency

- 20 incidents in each of FOD, Damage, Delay, Safety-Breach, and Equipment-Failure.
- 20 reports per carrier: AI, 6E, SG, UK, OTHER. The current configured route zone is used, not a hardcoded replacement.
- 42 Normal, 30 High, and 28 Emergency incidents. Emergency uses the existing `Critical` urgency/priority-0 representation; Safety-Breach always has priority 0 and Damage is at least High. No new priority enum or API value is introduced.
- The first 80 reports genuinely move Pending → Assigned → In Progress → Resolved through the API and release their capacity.
- The remaining 20 use the actual dispatch engine and current handler availability/capacity. Successfully assigned incidents alternate Assigned/In Progress; reports exceeding eligible capacity remain Pending. **Status counts are measured, not forced.** With the preserved original one active assignment and existing capacity of two per team, the expected synthetic result is 80 Resolved, 5 Assigned, 4 In Progress, 11 Pending.
- Dates span approximately one month. After genuine transitions, a transaction translates only the labeled synthetic report's timeline and its associated assignment/audit/notification dates into a coherent fictional historical scenario. The 80 resolved scenarios have resolution times of 25–104 minutes. Validation audit timestamps remain the actual time the validator ran. Historical timestamps are never presented as real airport events.
- Safety-Breach submissions create notifications using the existing persisted notification system. With one active safety officer, there are 20 synthetic notifications. With multiple officers, each gets its own event; counts can differ. Synthetic notifications are **in-app only**, explicitly labeled, and excluded from the SMTP worker.

Reports contain `[SYNTHETIC DEMO ...]` in their description, synthetic reporter/contact details, and a trusted `demoDataset` marker. Assignments, notifications, and audit events carry the same marker; the inbox displays a synthetic label. A regular API client cannot forge the trusted marker used for reset. SQLite original validation data includes the synthetic scenario marker. Existing records are not relabeled.

## Reset only this dataset

Back up databases and stop concurrent operational use first. Then, in a non-production environment:

```bash
ALLOW_SYNTHETIC_DEMO=true node --env-file=.env backend/src/seed.js --reset-demo
```

Reset uses one MongoDB transaction. It releases each still-active synthetic reservation exactly once, deletes only matching synthetic incidents and their tagged assignments/notifications/audits, and retains a reset audit event. Existing incident records, users, teams, routing, capacities, and non-demo assignments remain intact. Repeating reset removes zero reports. It never rewinds report counters or reuses old public report IDs. Reset does not dispatch unrelated Pending reports; use the ordinary dispatch retry afterward when appropriate.

SQLite validation records are deliberately retained as labeled historical audit evidence, including their original report correlations. They are not active incidents or dashboard records. Reset therefore does not claim to erase the complete audit trail. Do not delete the shared SQLite database to remove demonstration reports. For a clean production audit store, provision a separate production database/disk and retain the development audit backup under your retention policy.

## Production disablement

- Never seed this dataset in production. Both seed and reset refuse `NODE_ENV=production`, even if the opt-in flag is present.
- Keep `ALLOW_SYNTHETIC_DEMO` unset/false in production. Base setup never calls `--incidents` automatically.
- These guards disable synthetic writes; they do **not** hide previously seeded records. Reset the development dataset before promoting a database, or use a separate clean production database. Do not weaken the production guard on a live server to clean up data.
- Provision real controlled accounts separately and disable fictional accounts before public exposure.
- Synthetic SMTP suppression is enforced independently of the environment opt-in.

## Verification

```bash
npm test
.venv/bin/pytest -q validation-service/tests
node scripts/test-browser.mjs
npm run build
```

The new integration cases exercise all 100 real workflows, every category, computed priorities, historical dates, valid histories/assignments, workload consistency, preserved original records/configuration, idempotent reruns, selective reset, post-reset dynamic reporting, production guards, and unforgeable markers. The browser helper uses a dedicated `_test` MongoDB database, separate SQLite file, and isolated ports; it refuses other database-name suffixes before resetting data. It runs the existing browser suite without adding incidents to the application database. See the recorded results in `docs/`.
