# Executed test cases

Executed in this workspace on **13 November 2026** using real Flask/SQLite and a real MongoDB 7 replica set. Operational API tests use Supertest; there is no mocked validator, mocked database, or fabricated dispatch response. The browser tests use Chromium against Vite, Express, Flask, and MongoDB. They also passed against the compiled production bundle served with Vite preview.

Final results: **42 backend/integration/deployment tests + 30 Python tests + 2 frontend tests + 2 browser tests = 76 passed, 0 failed, 0 skipped**. The restart persistence check and dependency checks are additional operational checks, not included in this test count.

| ID | Objective and input | Expected output | Actual output | Result |
|---|---|---|---|---|
| TC01 | Aircraft `VT-ABC`, `VT-XYZ` | DFA and regex accept | Both accept | PASS |
| TC02 | `VT-AB1`, `VT-AB`, `VT-ABCD`, `vt-abc`, `ABC-XYZ` | Reject with reason, no dispatch | Rejected; rejection audit persisted | PASS |
| TC03 | `GND123`, `GND001`, `GND999` | DFA and regex accept | Both accept | PASS |
| TC04 | `GND12`, `GND1234`, `ABC123`, `GND12A`, trailing newline, non-ASCII numerals | Reject | Both reject | PASS |
| TC05 | Identifier fixtures plus 4,000 seeded random strings | DFA and regex agree | Agreement for every tested string | PASS |
| TC06 | “Foreign object debris found near aircraft.”, AI/A | FOD, primary assignment | FOD, H-AI, Assigned | PASS |
| TC07 | “A collision caused a dent” | Damage | Damage | PASS |
| TC08 | “late departure” | Delay | Delay | PASS |
| TC09 | “unsafe restricted area” | Safety-Breach | Safety-Breach, priority 0 | PASS |
| TC10 | “conveyor breakdown” | Equipment-Failure | Equipment-Failure | PASS |
| TC11 | “unsafe damage with debris and delay” | Safety wins, retain all matches | Safety-Breach; Safety/Damage/FOD/Delay retained | PASS |
| TC12 | “routine check”; syntactically valid but unsupported business identifiers; unknown carrier XX | Reject unknown category/unsupported IDs; correction queue for unknown routing key | 422, distinct business-rule errors with syntax still accepted; XX Pending correction | PASS |
| TC13 | Zone Z for AI route configured A | Correction queue, no assignment | Pending with correction reason | PASS |
| TC14 | H-AI unavailable | Backup assignment | H-OTHER assigned | PASS |
| TC15 | 12 simultaneous valid AI/A reports, primary/backup capacity 2 each | At most 4 assignments, no overbooking | 4 assignments, 8 Pending; every load ≤ capacity | PASS |
| TC16 | Critical debris report; critical malformed identifier | Priority 0 only for validated report | Emergency decision recorded; malformed report 422 | PASS |
| TC17 | All handlers unavailable; normal/high/critical queued; re-enable one slot. Also equal-time/equal-priority tie | Critical first; ties by timestamp/report ID | Critical assigned; normal/high wait. Equal-time lower report ID wins | PASS |
| TC18 | Five simultaneous submissions with one idempotency key, five repeated dispatches | One incident, one assignment, one occupied slot | Exactly one of each | PASS |
| TC19 | Assigned→Resolved, then Assigned→In Progress→Resolved | First denied, legal sequence succeeds | 409 then two 200 responses; full history | PASS |
| TC20 | Database client reconnect; controlled Docker MongoDB restart | Persistent report, assignments, loads, and SQLite audit counts survive | Stored report recovered; restart snapshots match | PASS |
| TC21 | Submit Safety-Breach, retrieve officer inbox, mark notification read | Persisted delivered in-app event and readable notification | Correct report/recipient; read=true | PASS |
| TC22 | Unauthenticated report access, staff admin/status mutation, other-team supervisor access | 401/403/404 by boundary | Expected denials returned | PASS |
| TC23 | Search exact report ID, VT-ABC, VT-XYZ with status filter | Matching report only; no match empty | Correct matching and empty arrays | PASS |
| TC24 | Resolve assignment; two simultaneous resolutions | Capacity released once, no negative load | Load zero; concurrent responses 200 and 409 | PASS |

## Additional executed coverage

- Explicit dead-state trace remains dead after an unexpected character.
- Case-insensitive keyword boundaries avoid `undamaged` and `predelay` false positives.
- Missing contact rejects and is audited without storing/dispatching an incident.
- Classification configuration rejects missing categories and accepts valid five-category customization.
- Aircraft-to-carrier map rejects a mismatched carrier independently of syntactic validation.
- Route changes are audited and can dispatch an eligible correction-queued report.
- Controlled account provisioning stores a bcrypt hash and permits subsequent login.
- Health checks both MongoDB and SQLite-backed Flask.
- Unavailable Flask fails closed with 503 and zero assignments.
- Durable recovery links accepted SQLite audit IDs to committed report IDs.
- Multipart attachment upload/download succeeds and unauthenticated download is denied.
- React priority label and report/aircraft search behavior execute under Vitest.
- Browser: staff validates/submits, opens incident details, supervisor opens My assignments, marks In Progress then Resolved, and staff runs the DFA simulator.
- Browser: administrator opens routing, analytics, safety and administration; mobile menu/report page works at 390×844 without horizontal document overflow or uncaught browser errors.

## Evidence and commands

- [Node and frontend runner output](node-test-results.txt)
- [Pytest output](python-test-results.txt)
- [Playwright JSON results](e2e-results.json)
- [Production build output](build-results.txt)
- [Production dependency audit](dependency-audit.json)
- [Restart persistence result](persistence-results.txt)
- [Python dependency consistency](python-dependency-results.txt)
- [Desktop dashboard](dashboard-desktop.png), [incident details](incident-desktop.png), [mobile reports](reports-mobile.png)

Run commands are in the README. The integration runner refuses a database without the `_test` suffix before dropping test data. Browser tests intentionally write fictional local demo reports and must never target production.

The attachment check initially failed because Express denied the hidden `.data` path; the authenticated download route was corrected and the test rerun successfully. An initial browser test raced navigation when capturing a report ID; waiting for the incident URL fixed the test, followed by successful reruns. These are resolved failures, not omitted checks.

Not executed: public hosting deployment, Atlas connectivity, external SMTP delivery, production load testing, or production backup restore. No credentials for those external environments were supplied. In-app safety notifications and local durable persistence were exercised successfully.

## Synthetic seed extension

Four additional backend integration tests passed: (1) 100 real incident workflows with category/priority/status/timeline/assignment/capacity invariants, original five records/configuration preservation and duplicate-free reruns; (2) selective idempotent reset, released capacity and subsequent dynamic submission/resolution; (3) default-off and production guards; (4) refusal of forged trusted demo markers through normal API clients.

The full existing browser suite was rerun through `node scripts/test-browser.mjs` against separate test MongoDB/SQLite services, preserving the five original application reports. Additional read-only browser checks confirmed the enriched overview, all analytics, and labeled safety inbox render without uncaught errors.

Actual application database: 100 new synthetic incidents, 20 per category/zone, plus five preserved originals (105 total). Priority distribution is 42 Normal / 30 High / 28 Emergency (existing Critical value). Synthetic statuses: 80 Resolved / 5 Assigned / 4 In Progress / 11 Pending. Twenty synthetic safety notifications are persisted. A second seed generated zero records. Fingerprint checks verified 42 pre-existing records/configuration documents remained unchanged (handler workload/timestamps excluded because real reservations legitimately changed them).

Evidence: [seed output](synthetic-seed-results.json), [rerun output](synthetic-rerun-results.json), [preservation and dashboard verification](synthetic-verification-results.json), [isolated browser runner output](synthetic-browser-results.txt), [dashboard](synthetic-dashboard.png), [analytics](synthetic-analytics.png), [safety inbox](synthetic-safety.png). See [seed/reset instructions](synthetic-demonstration-data.md).

## Deployment preparation verification

Eight additional Node tests cover exact-origin CORS, authorization/idempotency preflight headers, rejected origins, invalid allowlists, API-first Vercel rewrites, safe HTTPS targets, Render private-service discovery, and missing/invalid production validation destinations. Three additional Python tests verify audit write failure returns 503, committed audit records survive service recreation, and SQLite's online backup captures WAL records without overwriting the live database or an existing snapshot.

The full suite passed: 42 Node, 30 Python, two frontend and two isolated browser tests (76 total), plus the production build. The Render YAML was syntax-parsed with two service, persistent-disk and manual-deploy invariants checked. Platform acceptance, paid-resource provisioning and actual public URLs have not been tested or approved by these local checks. New runner evidence: [Node](deployment-verification/node.txt), [Python](deployment-verification/python.txt), [browser](deployment-verification/browser.txt), [build](deployment-verification/build.txt).
