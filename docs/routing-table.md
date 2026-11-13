# Routing and dispatch

All entries below are fictional operational assignments. UK is a legacy example, not a claim of current airline operations. Registrations do not identify a carrier; staff separately supply carrierCode. Optional administrator business rules can enforce an explicit aircraft-to-carrier map.

| Carrier | Primary team | Zone | Handler | Backup |
|---|---|---|---|---|
| AI | Air India Ground Handling / TEAM-AI | A | H-AI | TEAM-OTHER |
| 6E | IndiGo Ground Handling / TEAM-6E | B | H-6E | TEAM-OTHER |
| SG | SpiceJet Ground Handling / TEAM-SG | C | H-SG | TEAM-OTHER |
| UK | Airline Team 4 / TEAM-UK | D | H-UK | TEAM-OTHER |
| OTHER | General Ground Handling Pool / TEAM-OTHER | E (configurable) | H-OTHER | TEAM-AI |

Each database route stores supervisor and escalation authority as well as carrier, zone, primary and backup teams. Each team has one modeled handler, availability, capacity, and currentLoad. Default capacity is two. Administrators can change routes, backups, capacity, and availability. Supervisors can change only their own availability and statuses.

## Dispatch algorithm

Under a replica-set transaction and shared MongoDB dispatch lock:

1. Read Pending reports ordered by `(priority ASC, createdAt ASC, reportId ASC)`.
2. Look up the exact carrier rule. Unknown carrier or mismatch with its configured zone enters the correction queue, with an explicit reason and no handler.
3. Atomically reserve the primary handler only if available and `currentLoad < capacity`.
4. Otherwise try the explicitly configured backup team, which is eligible to cover the primary zone.
5. If both are unavailable/full, retain Pending with waiting-queue escalation authority. Never silently default to OTHER for an unknown carrier.
6. On successful reservation, record assignment, assigned handler, routing decision, status history, and dispatch audit in the same transaction.

No recursive backup traversal is used, so cycles cannot hang dispatch. The backup can cover the original zone as configured by its route; its home zone does not replace the incident zone.

Priority 0 = Critical urgency or Safety-Breach. Priority 1 = High urgency or Damage. Priority 2 = Normal. Critical ordering never bypasses validation, grants extra capacity, or preempts work already assigned.

## Exceptional scenarios

| Scenario | Behavior |
|---|---|
| Unknown key/zone | Pending correction queue; admin corrects configured route or staff submits corrected report |
| Malformed identifier | HTTP 422, Python and Express rejection audits; no Incident/Assignment |
| Unsupported identifier | Syntax may pass, but configured supported lists or carrier lookup reject with a distinct business-rule error |
| Unavailable/full handler | Try configured backup, otherwise waiting queue |
| Critical | Priority 0; Safety-Breach additionally persists safety notification |
| Concurrent reports | Shared database lock, conditional capacity reservation, unique assignment index, transaction retries |
| Duplicate HTTP retry | Same user + Idempotency-Key returns existing report; no duplicate capacity reservation |

Availability/route changes, explicit admin retry, and resolution trigger queue draining. A handler cannot lower capacity below its current workload. Valid operator transitions are Assigned → In Progress → Resolved. Pending → Assigned is owned exclusively by the dispatch engine. Every status transition contains actor ID and timestamp.
