import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
process.env.JWT_SECRET = "test-signing-secret-with-at-least-32-characters";
process.env.SERVICE_TOKEN = "integration-service-token";
process.env.VALIDATION_URL = "http://127.0.0.1:5099";
process.env.UPLOAD_DIR = ".data/test-uploads";
const { app } = await import("./app.js");
const { seed } = await import("./seed.js");
const {
  User,
  Handler,
  Route,
  Incident,
  Assignment,
  Notification,
  Audit,
  Setting,
  Counter,
} = await import("./models.js");
let python;
const tokens = {};
const payload = (extra = {}) => ({
  reporterName: "Fictional Staff",
  contact: "staff@agil.test",
  aircraftRegistration: "VT-ABC",
  incidentCode: "GND123",
  carrierCode: "AI",
  zone: "A",
  description: "Foreign object debris found near aircraft.",
  urgency: "Normal",
  occurredAt: new Date().toISOString(),
  ...extra,
});
const as = (method, url, role = "admin") =>
  request(app)[method](url).set("Authorization", `Bearer ${tokens[role]}`);
const submit = (extra = {}, key = randomUUID(), role = "staff") =>
  as("post", "/api/incidents", role)
    .set("Idempotency-Key", key)
    .send(payload(extra));
before(async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  fs.mkdirSync(`${root}/.data`, { recursive: true });
  python = spawn(`${root}/.venv/bin/python`, ["app.py"], {
    cwd: `${root}/validation-service`,
    env: {
      ...process.env,
      PORT: "5099",
      VALIDATION_DB: `${root}/.data/test-validation-${Date.now()}.sqlite`,
    },
    stdio: "ignore",
  });
  for (let n = 0; n < 80; n++) {
    try {
      if ((await fetch(`${process.env.VALIDATION_URL}/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
    if (n === 79) throw Error("Python failed to start");
  }
  await mongoose.connect(
    process.env.TEST_MONGODB_URI ||
      "mongodb://127.0.0.1:27017/agil_test?replicaSet=agil",
  );
  if (!mongoose.connection.name.endsWith("_test"))
    throw Error("Tests require a database name ending in _test");
  await mongoose.connection.dropDatabase();
  await seed("Integration-password-2026");
  for (const role of ["staff", "supervisor", "safety", "admin"]) {
    const r = await request(app)
      .post("/api/auth/login")
      .send({
        email: `${role}@agil.test`,
        password: "Integration-password-2026",
      });
    assert.equal(r.status, 200);
    tokens[role] = r.body.token;
  }
});
beforeEach(async () => {
  await Setting.deleteMany({ key: /^demo-/ });
  await Promise.all([
    Incident.deleteMany({}),
    Assignment.deleteMany({}),
    Notification.deleteMany({}),
    Audit.deleteMany({}),
    Counter.deleteMany({}),
  ]);
  await Handler.updateMany(
    {},
    { $set: { available: true, capacity: 2, currentLoad: 0 } },
  );
  await Route.updateOne(
    { carrierCode: "AI" },
    { $set: { zone: "A", teamId: "TEAM-AI", backupTeamId: "TEAM-OTHER" } },
  );
  await Setting.deleteMany({ key: { $in: ["keywords", "businessRules"] } });
});
after(async () => {
  await mongoose.disconnect();
  python?.kill("SIGTERM");
});
test("TC01/03/06: complete valid FOD workflow uses authoritative service and primary route", async () => {
  const r = await submit();
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.category, "FOD");
  assert.equal(r.body.status, "Assigned");
  assert.equal(r.body.assignedHandler, "H-AI");
  assert.equal(r.body.validationResult.aircraft.agreement, true);
  assert.match(r.body.reportId, /^AGIL-\d{4}-\d{6}$/);
});
test("TC02/04: malformed identifiers rejected and audited without dispatch", async () => {
  const r = await submit({
    aircraftRegistration: "vt-abc",
    incidentCode: "GND12",
  });
  assert.equal(r.status, 422);
  assert.equal(await Incident.countDocuments(), 0);
  assert.equal(await Assignment.countDocuments(), 0);
  assert.equal(await Audit.countDocuments({ action: "rejected-report" }), 1);
});
test("TC07: damage classification", async () =>
  assert.equal(
    (await submit({ description: "A collision caused a dent" })).body.category,
    "Damage",
  ));
test("TC08: delay classification", async () =>
  assert.equal(
    (await submit({ description: "late departure" })).body.category,
    "Delay",
  ));
test("TC09/21: safety notification persists and is scoped to officer", async () => {
  const r = await submit({ description: "unsafe restricted area" });
  assert.equal(r.body.category, "Safety-Breach");
  const notices = await as("get", "/api/notifications", "safety");
  assert.equal(notices.body.length, 1);
  assert.equal(notices.body[0].deliveryStatus, "Delivered in-app");
  assert.equal(notices.body[0].reportId, r.body.reportId);
  assert.equal(
    (
      await as(
        "patch",
        `/api/notifications/${notices.body[0].notificationId}/read`,
        "safety",
      ).send({})
    ).body.read,
    true,
  );
});
test("TC10: equipment classification", async () =>
  assert.equal(
    (await submit({ description: "conveyor breakdown" })).body.category,
    "Equipment-Failure",
  ));
test("TC11: category priority wins multiple matches", async () => {
  const r = await submit({
    description: "unsafe damage with debris and delay",
  });
  assert.equal(r.body.category, "Safety-Breach");
  assert.deepEqual(r.body.matchedCategories, [
    "Safety-Breach",
    "Damage",
    "FOD",
    "Delay",
  ]);
});
test("TC12: unknown description rejected; unknown carrier safely enters correction queue", async () => {
  assert.equal((await submit({ description: "routine check" })).status, 422);
  const r = await submit({ carrierCode: "XX" });
  assert.equal(r.body.status, "Pending");
  assert.match(r.body.routingDecision, /Correction/);
});
test("TC13: unknown zone enters correction queue", async () => {
  const r = await submit({ zone: "Z" });
  assert.equal(r.body.status, "Pending");
  assert.match(r.body.routingDecision, /Correction queue/);
});
test("TC14: unavailable primary selects eligible backup", async () => {
  await Handler.updateOne(
    { handlerId: "H-AI" },
    { $set: { available: false } },
  );
  assert.equal((await submit()).body.assignedHandler, "H-OTHER");
});
test("TC15/17: simultaneous submissions never overbook and excess reports queue", async () => {
  const responses = await Promise.all(
    Array.from({ length: 12 }, () => submit()),
  );
  assert.ok(
    responses.every((r) => r.status === 201),
    JSON.stringify(responses.map((r) => r.body)),
  );
  assert.equal(await Assignment.countDocuments(), 4);
  assert.equal(await Incident.countDocuments({ status: "Pending" }), 8);
  for (const h of await Handler.find()) assert.ok(h.currentLoad <= h.capacity);
});
test("TC16: critical override never bypasses identifier validation", async () => {
  const r = await submit({ urgency: "Critical" });
  assert.equal(r.body.priority, 0);
  assert.match(r.body.routingDecision, /Emergency/);
  assert.equal(
    (await submit({ urgency: "Critical", aircraftRegistration: "bad" })).status,
    422,
  );
});
test("TC17: queue dispatch sorts priority then timestamp then report ID", async () => {
  await Handler.updateMany({}, { $set: { available: false } });
  const normal = await submit();
  const high = await submit({ urgency: "High" });
  const critical = await submit({ urgency: "Critical" });
  await as("patch", "/api/handlers/H-AI/capacity").send({ capacity: 1 });
  const enabled = await as("patch", "/api/handlers/H-AI/availability").send({
    availability: true,
  });
  assert.equal(enabled.status, 200);
  assert.equal(
    (await Incident.findOne({ reportId: critical.body.reportId })).status,
    "Assigned",
  );
  assert.equal(
    (await Incident.findOne({ reportId: normal.body.reportId })).status,
    "Pending",
  );
  assert.equal(
    (await Incident.findOne({ reportId: high.body.reportId })).status,
    "Pending",
  );
});
test("TC18: concurrent repeated submissions and dispatch cannot duplicate assignments", async () => {
  const key = randomUUID();
  const r = await Promise.all(Array.from({ length: 5 }, () => submit({}, key)));
  assert.ok(r.every((x) => [200, 201].includes(x.status)));
  assert.equal(await Incident.countDocuments(), 1);
  await Promise.all(
    Array.from({ length: 5 }, () =>
      as("post", "/api/routing/dispatch").send({}),
    ),
  );
  assert.equal(await Assignment.countDocuments(), 1);
  assert.equal((await Handler.findOne({ handlerId: "H-AI" })).currentLoad, 1);
});
test("TC19/24: transition enforcement and resolution releases capacity", async () => {
  const r = await submit(),
    id = r.body.reportId;
  assert.equal(
    (
      await as("patch", `/api/incidents/${id}/status`, "supervisor").send({
        status: "Resolved",
      })
    ).status,
    409,
  );
  for (const status of ["In Progress", "Resolved"])
    assert.equal(
      (
        await as("patch", `/api/incidents/${id}/status`, "supervisor").send({
          status,
        })
      ).status,
      200,
    );
  assert.equal((await Handler.findOne({ handlerId: "H-AI" })).currentLoad, 0);
  assert.deepEqual(
    (await Incident.findOne({ reportId: id })).history.map((h) => h.status),
    ["Pending", "Assigned", "In Progress", "Resolved"],
  );
});
test("TC20: data persists across database client reconnect", async () => {
  const r = await submit();
  const uri =
    process.env.TEST_MONGODB_URI ||
    "mongodb://127.0.0.1:27017/agil_test?replicaSet=agil";
  await mongoose.disconnect();
  await mongoose.connect(uri);
  assert.equal(
    (await Incident.findOne({ reportId: r.body.reportId })).description,
    payload().description,
  );
});
test("TC22: authorization denies unauthenticated access and staff admin actions", async () => {
  assert.equal((await request(app).get("/api/incidents")).status, 401);
  assert.equal((await as("get", "/api/admin/users", "staff")).status, 403);
  const r = await submit();
  assert.equal(
    (
      await as(
        "patch",
        `/api/incidents/${r.body.reportId}/status`,
        "staff",
      ).send({ status: "In Progress" })
    ).status,
    403,
  );
});
test("TC23: report ID and aircraft search plus date/status filters", async () => {
  const r = await submit();
  assert.equal(
    (await as("get", `/api/incidents?search=${r.body.reportId}`, "staff")).body
      .length,
    1,
  );
  assert.equal(
    (await as("get", "/api/incidents?search=VT-ABC&status=Assigned", "staff"))
      .body.length,
    1,
  );
  assert.equal(
    (await as("get", "/api/incidents?search=VT-XYZ", "staff")).body.length,
    0,
  );
});
test("Incomplete reports audited, not dispatched", async () => {
  assert.equal((await submit({ contact: "" })).status, 422);
  assert.equal(await Incident.countDocuments(), 0);
});
test("Supervisor cannot see another team or change capacity", async () => {
  await Handler.updateOne(
    { handlerId: "H-AI" },
    { $set: { available: false } },
  );
  const r = await submit();
  assert.equal(
    (await as("get", `/api/incidents/${r.body.reportId}`, "supervisor")).status,
    404,
  );
  assert.equal(
    (
      await as("patch", "/api/handlers/H-AI/capacity", "supervisor").send({
        capacity: 20,
      })
    ).status,
    403,
  );
});
test("Admin route changes audited and retry correction queue", async () => {
  const r = await submit({ zone: "Z" });
  const route = await Route.findOne({ carrierCode: "AI" });
  assert.equal(
    (await as("patch", `/api/routing/${route._id}`).send({ zone: "Z" })).status,
    200,
  );
  assert.equal(
    (await Incident.findOne({ reportId: r.body.reportId })).status,
    "Assigned",
  );
  assert.equal(await Audit.countDocuments({ action: "route-update" }), 1);
});
test("Classification settings validate exactly five categories", async () => {
  assert.equal(
    (await as("put", "/api/admin/settings").send({ FOD: ["thing"] })).status,
    422,
  );
  const rules = {
    FOD: ["rubbish"],
    Damage: ["damage"],
    Delay: ["delay"],
    "Safety-Breach": ["unsafe"],
    "Equipment-Failure": ["malfunction"],
  };
  assert.equal(
    (await as("put", "/api/admin/settings").send(rules)).status,
    200,
  );
  assert.equal(
    (await submit({ description: "rubbish near aircraft" })).body.category,
    "FOD",
  );
});
test("Controlled provisioning and login", async () => {
  const email = `user-${randomUUID()}@agil.test`;
  assert.equal(
    (
      await as("post", "/api/admin/users").send({
        name: "Test Staff",
        email,
        password: "Secure-test-password-2026",
        role: "staff",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/auth/login")
        .send({ email, password: "Secure-test-password-2026" })
    ).status,
    200,
  );
});
test("Health checks both dependencies", async () => {
  assert.equal((await request(app).get("/api/health")).status, 200);
});

test("Unsupported business identifiers and aircraft-carrier mapping are distinct from syntax errors", async () => {
  await Setting.create({
    key: "businessRules",
    value: {
      supportedAircraft: ["VT-XYZ"],
      supportedCodes: ["GND001"],
      aircraftCarriers: { "VT-XYZ": "6E" },
    },
  });
  const r = await submit();
  assert.equal(r.status, 422);
  assert.equal(r.body.validation.aircraft.accepted, true);
  assert.match(r.body.errors.join(" "), /unsupported/);
  const mapped = await submit({
    aircraftRegistration: "VT-XYZ",
    incidentCode: "GND001",
  });
  assert.equal(mapped.status, 422);
  assert.match(mapped.body.errors.join(" "), /Carrier does not match/);
});
test("Durable recovery links SQLite validation ID to committed MongoDB report ID", async () => {
  const r = await submit();
  assert.equal(r.status, 201);
  const { recover } = await import("./recovery.js");
  await recover();
  assert.equal(
    (await Incident.findOne({ reportId: r.body.reportId }))
      .validationAuditLinked,
    true,
  );
});
test("Attachments require authorization and survive upload/download", async () => {
  const p = payload();
  let req = as("post", "/api/incidents", "staff").set(
    "Idempotency-Key",
    randomUUID(),
  );
  for (const [k, v] of Object.entries(p)) req = req.field(k, v);
  const r = await req.attach(
    "attachment",
    Buffer.from("%PDF-1.4\nFictional demonstration attachment"),
    { filename: "demo.pdf", contentType: "application/pdf" },
  );
  assert.equal(r.status, 201);
  assert.equal(
    (await as("get", `/api/incidents/${r.body.reportId}/attachment`, "staff"))
      .status,
    200,
  );
  assert.equal(
    (await request(app).get(`/api/incidents/${r.body.reportId}/attachment`))
      .status,
    401,
  );
});

test("Queue ties use timestamp then stable report ID", async () => {
  await Handler.updateMany({}, { $set: { available: false } });
  const first = await submit(),
    second = await submit();
  const same = new Date("2026-01-01T00:00:00Z");
  await Incident.collection.updateMany({}, { $set: { createdAt: same } });
  await as("patch", "/api/handlers/H-AI/capacity").send({ capacity: 1 });
  await as("patch", "/api/handlers/H-AI/availability").send({
    availability: true,
  });
  assert.equal(
    (await Incident.findOne({ reportId: first.body.reportId })).status,
    "Assigned",
  );
  assert.equal(
    (await Incident.findOne({ reportId: second.body.reportId })).status,
    "Pending",
  );
});
test("Concurrent resolution releases capacity once", async () => {
  const r = await submit();
  const url = `/api/incidents/${r.body.reportId}/status`;
  await as("patch", url, "supervisor").send({ status: "In Progress" });
  const replies = await Promise.all([
    as("patch", url, "supervisor").send({ status: "Resolved" }),
    as("patch", url, "supervisor").send({ status: "Resolved" }),
  ]);
  assert.deepEqual(replies.map((x) => x.status).sort(), [200, 409]);
  assert.equal((await Handler.findOne({ handlerId: "H-AI" })).currentLoad, 0);
});
test("Unavailable validation service fails closed without dispatch", async () => {
  const saved = process.env.VALIDATION_URL;
  process.env.VALIDATION_URL = "http://127.0.0.1:5999";
  try {
    assert.equal((await submit()).status, 503);
    assert.equal(await Incident.countDocuments(), 0);
    assert.equal(await Assignment.countDocuments(), 0);
  } finally {
    process.env.VALIDATION_URL = saved;
  }
});

test("Synthetic dataset: 100 real workflows, balanced categories, preserved records, capacity and rerun invariants", async () => {
  process.env.ALLOW_SYNTHETIC_DEMO = "true";
  try {
    // Match the existing application: four resolved records and one live assignment.
    for (let i = 0; i < 4; i++) {
      const r = await submit();
      for (const status of ["In Progress", "Resolved"])
        assert.equal(
          (
            await as("patch", `/api/incidents/${r.body.reportId}/status`).send({
              status,
            })
          ).status,
          200,
        );
    }
    await submit();
    const originals = JSON.stringify(
      await Incident.find().sort({ reportId: 1 }).lean(),
    );
    const routes = JSON.stringify(await Route.find().lean());
    const users = JSON.stringify(await User.find().lean());
    const configuration = (await Handler.find().lean()).map(
      ({ currentLoad, updatedAt, ...h }) => h,
    );
    const { seedDemonstration, DATASET } = await import("./demo-seed.js");
    const summary = await seedDemonstration();
    assert.equal(summary.generated, 100);
    assert.equal(summary.total, 100);
    assert.deepEqual(summary.categories, {
      FOD: 20,
      Damage: 20,
      Delay: 20,
      "Safety-Breach": 20,
      "Equipment-Failure": 20,
    });
    assert.deepEqual(summary.priorities, {
      Normal: 42,
      High: 30,
      "Emergency (Critical)": 28,
    });
    assert.equal(summary.statuses.Resolved, 80);
    assert.equal(summary.statuses.Assigned, 5);
    assert.equal(summary.statuses["In Progress"], 4);
    assert.equal(summary.statuses.Pending, 11);
    assert.equal(summary.notifications, 20);
    assert.equal(
      JSON.stringify(
        await Incident.find({ demoDataset: { $ne: DATASET } })
          .sort({ reportId: 1 })
          .lean(),
      ),
      originals,
    );
    assert.equal(JSON.stringify(await Route.find().lean()), routes);
    assert.equal(JSON.stringify(await User.find().lean()), users);
    assert.deepEqual(
      (await Handler.find().lean()).map(
        ({ currentLoad, updatedAt, ...h }) => h,
      ),
      configuration,
    );
    for (const h of await Handler.find()) {
      assert.ok(h.currentLoad <= h.capacity);
      assert.equal(
        h.currentLoad,
        await Incident.countDocuments({
          assignedHandler: h.handlerId,
          status: { $in: ["Assigned", "In Progress"] },
        }),
      );
    }
    const rows = await Incident.find({ demoDataset: DATASET });
    assert.ok(
      new Set(rows.map((r) => r.createdAt.toISOString().slice(0, 10))).size >
        20,
    );
    for (const r of rows) {
      assert.match(r.description, /SYNTHETIC DEMO/);
      assert.equal(r.validationResult.valid, true);
      const expected = {
        Pending: ["Pending"],
        Assigned: ["Pending", "Assigned"],
        "In Progress": ["Pending", "Assigned", "In Progress"],
        Resolved: ["Pending", "Assigned", "In Progress", "Resolved"],
      }[r.status];
      assert.deepEqual(
        r.history.map((h) => h.status),
        expected,
      );
      for (let i = 1; i < r.history.length; i++)
        assert.ok(r.history[i].timestamp >= r.history[i - 1].timestamp);
      const a = await Assignment.findOne({ reportId: r.reportId });
      assert.equal(!!a, r.status !== "Pending");
      if (a) {
        assert.equal(a.assignmentStatus, r.status);
        assert.equal(a.handlerId, r.assignedHandler);
        assert.equal(a.demoDataset, DATASET);
      }
    }
    assert.equal(
      await Notification.countDocuments({
        demoDataset: DATASET,
        emailStatus: "Synthetic — in-app only",
      }),
      20,
    );
    const before = JSON.stringify(
      await Incident.find().sort({ reportId: 1 }).lean(),
    );
    assert.equal((await seedDemonstration()).generated, 0);
    assert.equal(
      JSON.stringify(await Incident.find().sort({ reportId: 1 }).lean()),
      before,
    );
  } finally {
    delete process.env.ALLOW_SYNTHETIC_DEMO;
  }
});
test("Synthetic reset removes only its dataset, releases live capacity once, and normal submissions still resolve", async () => {
  process.env.ALLOW_SYNTHETIC_DEMO = "true";
  try {
    const original = await submit();
    const { seedDemonstration, resetDemonstration, DATASET } =
      await import("./demo-seed.js");
    await seedDemonstration();
    assert.equal((await resetDemonstration()).removed, 100);
    assert.equal((await resetDemonstration()).removed, 0);
    assert.equal(await Incident.countDocuments(), 1);
    assert.equal(
      (await Incident.findOne({ reportId: original.body.reportId })).status,
      "Assigned",
    );
    assert.equal(await Assignment.countDocuments(), 1);
    assert.equal(
      await Notification.countDocuments({ demoDataset: DATASET }),
      0,
    );
    assert.equal((await Handler.findOne({ handlerId: "H-AI" })).currentLoad, 1);
    const fresh = await submit();
    assert.equal(fresh.status, 201);
    assert.equal(fresh.body.status, "Assigned");
    for (const status of ["In Progress", "Resolved"])
      assert.equal(
        (
          await as(
            "patch",
            `/api/incidents/${fresh.body.reportId}/status`,
          ).send({ status })
        ).status,
        200,
      );
  } finally {
    delete process.env.ALLOW_SYNTHETIC_DEMO;
  }
});
test("Synthetic seeding/reset are disabled by default and always refused in production", async () => {
  const { seedDemonstration, resetDemonstration } =
    await import("./demo-seed.js");
  await assert.rejects(seedDemonstration(), /disabled/);
  await assert.rejects(resetDemonstration(), /disabled/);
  process.env.ALLOW_SYNTHETIC_DEMO = "true";
  const old = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await assert.rejects(seedDemonstration(), /disabled/);
    await assert.rejects(resetDemonstration(), /disabled/);
  } finally {
    delete process.env.ALLOW_SYNTHETIC_DEMO;
    if (old === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = old;
  }
  assert.equal(await Incident.countDocuments(), 0);
});
test("Normal API clients cannot forge trusted demo markers for selective reset", async () => {
  const r = await submit({ demoDataset: "agil-synthetic-v1" });
  assert.equal(r.status, 201);
  assert.equal(r.body.demoDataset, undefined);
});
