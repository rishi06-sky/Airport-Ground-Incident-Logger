# Database design

MongoDB runs as a replica set because dispatch requires transactions. Mongoose schemas and indexes are defined in `backend/src/models.js`.

| Collection | Identity / important constraints | References and records |
|---|---|---|
| Users | unique userId and email | bcrypt passwordHash, role, assignedTeam (handler ID), active |
| Incidents | unique reportId and user-scoped idempotencyKey | reporterId, originalData, validationResult, classification, priority, status, assignedHandler, history, attachment filename, resolvedAt |
| Handlers | unique handlerId and teamId | zone, available, capacity, currentLoad |
| RoutingRules | unique carrierCode | teamId, backupTeamId, zone, supervisor, escalationAuthority |
| Assignments | unique reportId | handlerId, team, zone, priority, routingDecision, assignedAt, assignmentStatus |
| Notifications | unique notificationId | reportId, recipientId, in-app deliveryStatus, read, optional email state/claims/attempts |
| AuditLogs | eventId | action, reportId, actorId, previousValue, newValue, createdAt |
| Settings | unique key | classification keywords, supported identifiers/carrier map, dispatch serialization revision |
| Counters | year primary key | incrementing report sequence |

Incidents additionally index queue order and reporter/status. All collections use createdAt/updatedAt. Relationships use stable business IDs; primary database ObjectIds remain internal except routing-rule edit identifiers.

SQLite `ValidationAudit` stores validationId primary key, reportId (eventually linked), aircraftRegistration, incidentCode, serialized DFA traces/results, regex results, acceptance/rejection, error list, UTC timestamp, and original submitted validation data. WAL mode and a connection timeout permit concurrent service requests. Use one durable SQLite disk/service instance in production; do not place SQLite on ephemeral serverless storage.

Operational data is separate from demo provisioning: seed inserts only users/teams/routes and never manufactured incident history. Automated integration tests use a separate `_test` database. Browser tests intentionally create fictional demonstration reports in the local demo database.

Persistence: MongoDB Docker named volume, root `.data/validation.sqlite`, and `.data/uploads/` survive application restarts. Production must supply durable storage and backups for all three. The database-restart test compares persisted incident and assignment counts before/after a controlled restart. The client-reconnect test additionally verifies a stored report can be read through a new connection.

Consistency and recovery across stores are documented in [architecture.md](architecture.md). Back up MongoDB and SQLite together with correlation IDs; recovery must never derive handler loads from unlinked validation attempts. Capacity and assignments live entirely inside MongoDB transactions.
