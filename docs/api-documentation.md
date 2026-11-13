# REST API

Base path `/api`. All endpoints except login and health require `Authorization: Bearer <JWT>`. Dates use ISO 8601. Error bodies contain `error` and `requestId`; validation failures also contain `errors` and `validation`. Status codes: 200/201 success, 400 malformed request, 401 missing/invalid login, 403 forbidden role, 404 inaccessible/missing record, 409 transition/uniqueness conflict, 413 oversized attachment, 422 invalid report/configuration, 503 unavailable dependency.

Role abbreviations: staff = Ground Staff; supervisor = Ground Handling Supervisor; safety = Airport Safety Officer; admin = Administrator.

| Method | Endpoint | Role / behavior |
|---|---|---|
| POST | /auth/login | Public; email/password → token |
| GET | /auth/me | Current active user, password hash omitted |
| POST | /incidents | staff/admin; JSON or multipart; Idempotency-Key mandatory |
| GET | /incidents | Scoped list; search, category, status, from, to filters |
| GET | /incidents/:reportId | Scoped report, assignment and audit history |
| GET | /incidents/:reportId/attachment | Scoped authenticated attachment download |
| PATCH | /incidents/:reportId/status | Assigned supervisor/admin; status field |
| POST | /validation/check | Authenticated; identifiers/description → DFA, regex, category |
| POST | /validation/simulate | Authenticated read-only simulation, no operational/audit writes |
| POST | /validation/classify | Same authoritative combined validation/classification service |
| GET | /routing | supervisor/safety/admin |
| POST | /routing/dispatch | admin; retry Pending queue |
| PATCH | /routing/:mongoId | admin; zone, teamId, backupTeamId, supervisor, escalationAuthority |
| GET | /handlers | supervisor (own)/safety/admin |
| PATCH | /handlers/:handlerId/availability | own supervisor/admin; availability boolean |
| PATCH | /handlers/:handlerId/capacity | admin; capacity integer 1–100, not below currentLoad |
| GET | /dashboard/summary | Scoped metrics |
| GET | /dashboard/analytics | Scoped metrics and six chart data groups; from/to filters |
| GET | /notifications | safety (own/role-addressed)/admin |
| PATCH | /notifications/:notificationId/read | safety (own/role-addressed)/admin |
| GET/POST | /admin/users | admin; list / controlled creation |
| PATCH | /admin/users/:userId | admin; role, assignedTeam, active; cannot change own account |
| GET | /admin/audit | admin; newest 500 events including rejected original reports |
| GET/PUT | /admin/settings | admin; classification keyword object |
| GET/PUT | /admin/business-rules | admin; supported lists and aircraft mapping |
| GET | /health | Dependency health; 503 on degraded dependency |

## Login

Request:

```json
{"email":"staff@agil.test","password":"<locally configured demo password>"}
```

Successful response: `{"token":"<signed JWT>"}`. Never embed this token in URLs. Token expiry is eight hours; disabled accounts are denied immediately.

## Submit a report

`POST /api/incidents`, `Idempotency-Key: <new UUID generated once for this submission>`. Reuse the same key on uncertain network retries; use a new key for a distinct report. Duplicate keys are scoped to the authenticated user and return the existing report.

```json
{
  "reporterName":"Fictional Staff",
  "contact":"staff@agil.test",
  "aircraftRegistration":"VT-ABC",
  "incidentCode":"GND123",
  "carrierCode":"AI",
  "zone":"A",
  "description":"Foreign object debris found near aircraft.",
  "urgency":"Normal",
  "occurredAt":"2026-11-13T12:00:00+05:30"
}
```

The authenticated user determines reporterId; clients cannot assign another identity. To attach a file, send these fields as multipart form fields plus `attachment` (PNG, JPEG, or PDF, at most 5 MB). File download requires the same report authorization.

Response example (actual ID is allocated by the database):

```json
{
  "reportId":"AGIL-2026-000001",
  "reporterId":"demo-staff",
  "category":"FOD",
  "matchedCategories":["FOD"],
  "priority":2,
  "status":"Assigned",
  "assignedHandler":"H-AI",
  "routingDecision":"Primary route"
}
```

Fields omitted above include originalData, validationResult, timestamps and history. If primary and backup are full, successful submission instead returns status Pending and the waiting-queue explanation. Unsupported routing keys also return Pending with a correction reason; they are never silently routed to a valid airline.

## Validation

Use the same aircraftRegistration, incidentCode, description and urgency fields with `/validation/check`. Response includes:

```json
{
  "valid":true,
  "errors":[],
  "category":"FOD",
  "matchedCategories":["FOD"],
  "priority":2,
  "emergencyOverride":false,
  "aircraft":{"accepted":true,"regex":true,"agreement":true,"trace":[{"state":"q0","character":""}]},
  "code":{"accepted":true,"regex":true,"agreement":true,"trace":[{"state":"q0","character":""}]}
}
```

Trace arrays are abbreviated here; the actual API returns every character/state pair and rejection reasons. An invalid validation check or simulation returns 200 with `valid:false`; submitting the same invalid report returns 422 and does not dispatch.

## Status and handler mutations

- `PATCH /incidents/AGIL-2026-000001/status` with `{"status":"In Progress"}`, then `{"status":"Resolved"}`.
- `PATCH /handlers/H-AI/availability` with `{"availability":false}`.
- `PATCH /handlers/H-AI/capacity` with `{"capacity":3}`.

A staff member cannot mutate statuses; a supervisor cannot mutate another team's report or change capacity. Resolved is terminal. Duplicate status changes return 409.

## Administrative configuration

`PUT /admin/settings` accepts exactly five nonempty arrays:

```json
{"FOD":["debris","foreign object"],"Damage":["damage","collision"],"Delay":["delay","postponed"],"Safety-Breach":["unsafe","injury"],"Equipment-Failure":["malfunction","equipment failure"]}
```

`PUT /admin/business-rules`:

```json
{"supportedAircraft":["VT-ABC"],"supportedCodes":["GND123"],"aircraftCarriers":{"VT-ABC":"AI"}}
```

Empty lists mean every syntactically valid identifier is supported. A nonempty list is an allowlist. A code such as GND999 can therefore be syntactically valid and explicitly unsupported. Aircraft mapping is optional and never inferred from the registration prefix.

`POST /admin/users` requires name, email, password (12+ characters), role (`staff`, `supervisor`, `safety`, `admin`), and a valid assignedTeam handler ID for supervisors.

## Internal Python API

Not browser-facing. `/validate`, `/defaults`, and `/audit/link` require `X-Service-Token`. `/validate` additionally accepts rules supplied by Express; the browser cannot override configured classification/business rules through Express. `/audit/link` accepts validationId/reportId and is used by durable recovery. `/health` checks SQLite availability. Express propagates generated request IDs and enforces downstream timeouts.

The simulator and Test demonstration page use `/validation/simulate`, which forces read-only validation. Actual submission forces audit writes regardless of client-supplied fields.
