# Demonstration and viva guide

## Explain the project

Ground staff need a reliable way to report apron hazards and follow the response. AGIL validates structured identifiers, classifies five supported incident types, routes reports through configured handling teams, and records every response step.

BCS503: the DFA tracks one state per input character. It reaches q6 only after the exact prefix and three valid ASCII symbols. Regex is independently evaluated for comparison. Both validators must accept; no category match means correction rather than an invented sixth category.

BCS502: the carrier and zone form a routing key, the route identifies a primary and backup team, capacity limits admission, and the ordered waiting queue models priority scheduling. This is an application-level dispatch analogy to networking, not an implementation of IP packet forwarding. MongoDB transactions provide mutual exclusion and atomic updates under concurrent requests.

The frontend provides role-specific operational views; Express authenticates and authorizes; Flask owns validation/classification; MongoDB stores operational state; SQLite stores validation audits. Compare a browser test with a unit test: the former exercises the complete network/database/user workflow, while the latter isolates validation edge cases.

## Main workflow

1. Start services using README commands. Privately retrieve the generated demo password from `.env`.
2. Sign in as staff@agil.test and report:
   - Aircraft VT-ABC; code GND123; carrier AI; zone A.
   - Description: “Foreign object debris found near aircraft.”
   - Urgency Normal; use clearly fictional contact details and the current local incident time.
3. Click Validate & classify. Explain the seven-state accepting trace and FOD selection.
4. Submit. Note the database-allocated AGIL-year-sequence ID and primary handler H-AI (or backup/waiting if capacity was already occupied).
5. Sign in as supervisor@agil.test. Open the assignment, mark In Progress, then Resolved. Demonstrate the timeline and released capacity.
6. Sign in as administrator and review analytics, routing, and audit records. All counts come from stored reports.

## Exceptional demonstrations

- In the Test demonstration page enter `vt-abc`: both validators reject, with the rejecting transition. No operational report is created by that page; no operational or validation audit record is created by simulation.
- Description `unsafe equipment damage near runway`: Safety-Breach wins; submit it and open the safety officer inbox.
- Urgency Critical with a valid debris report: priority 0. Invalid identifiers are still rejected.
- Set H-AI unavailable: a new AI/A report goes to H-OTHER.
- Disable both H-AI and H-OTHER: submit normal then critical reports, then enable one slot. The critical queued report wins. Do not claim an assigned normal report will be preempted.
- Submit zone Z: report enters the correction queue with the reason. Administrators can correct the route and retry.
- Reuse the same Idempotency-Key in API requests: the same report is returned. The automated integration suite also sends simultaneous submissions and repeated dispatches, proving assignment uniqueness and capacity bounds.

See [test cases](test-cases.md) for executed evidence. Public deployment and SMTP delivery remain external validation steps, not demonstrated successes.
