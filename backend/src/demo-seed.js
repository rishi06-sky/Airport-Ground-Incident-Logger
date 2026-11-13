import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { app } from "./app.js";
import { locked } from "./dispatch.js";
import {
  Incident,
  Assignment,
  Notification,
  Audit,
  Setting,
  User,
  Route,
  Handler,
} from "./models.js";
export const DATASET = "agil-synthetic-v1";
const manifestKey = `demo-dataset:${DATASET}`;
const carriers = ["AI", "6E", "SG", "UK", "OTHER"];
const categories = [
  "FOD",
  "Damage",
  "Delay",
  "Safety-Breach",
  "Equipment-Failure",
];
const descriptions = {
  FOD: [
    "Loose material and debris found beside a baggage cart at stand",
    "Foreign object spotted during the apron walk near bay",
    "Runway object reported during a scheduled surface inspection at sector",
    "Debris from a torn cargo wrapping bag collected beside stand",
  ],
  Damage: [
    "A shallow dent identified on an aircraft service panel at stand",
    "Minor damage to a parked baggage cart reported beside bay",
    "A crack found on a non-flight equipment cover near sector",
    "Low-speed collision with a service barrier reported at stand",
  ],
  Delay: [
    "Ground delay while awaiting a replacement pushback crew at stand",
    "Late departure after extended baggage reconciliation at bay",
    "Departure postponed while an additional passenger transfer completes at sector",
    "Ground delay caused by a late catering handover at stand",
  ],
  "Safety-Breach": [
    "Safety violation: pedestrian entered a restricted area beside stand",
    "Unsafe crossing of an active vehicle lane reported near bay",
    "Safety breach: an unsecured access gate found near sector",
    "Unsafe working distance observed during a turnaround at stand",
  ],
  "Equipment-Failure": [
    "Conveyor breakdown stopped baggage loading beside stand",
    "Equipment failure in a ground power unit reported at bay",
    "Vehicle breakdown immobilized a baggage tractor near sector",
    "Machinery failure in an aircraft service lift reported at stand",
  ],
};
export function demoPlan(anchor, routes) {
  return Array.from({ length: 100 }, (_, i) => {
    const category = categories[i % 5],
      occurrence = Math.floor(i / 5),
      carrierCode = carriers[occurrence % 5];
    const route = routes.find((r) => r.carrierCode === carrierCode);
    if (!route)
      throw Error(
        `Missing existing route ${carrierCode}; no routing settings were changed`,
      );
    const historical = i < 80;
    const createdAt = new Date(
      anchor.getTime() -
        (historical
          ? (31 - Math.floor(i / 3)) * 86400000
          : (20 - (i - 80)) * 3600000),
    );
    return {
      index: i,
      category,
      historical,
      createdAt,
      data: {
        demoDataset: DATASET,
        reporterName: "Synthetic Demonstration Crew",
        contact: "synthetic-operations@agil.test",
        aircraftRegistration: `VT-D${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`,
        incidentCode: `GND${String(100 + i).padStart(3, "0")}`,
        carrierCode,
        zone: route.zone,
        description: `[SYNTHETIC DEMO ${DATASET} #${String(i + 1).padStart(3, "0")}] ${descriptions[category][occurrence % 4]} ${route.zone}${String(1 + (i % 12)).padStart(2, "0")}. Fictional training scenario; no real airport event.`,
        urgency:
          occurrence % 10 === 9
            ? "Critical"
            : occurrence % 10 >= 7
              ? "High"
              : "Normal",
        occurredAt: createdAt.toISOString(),
      },
    };
  });
}
function enabled() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ALLOW_SYNTHETIC_DEMO !== "true"
  )
    throw Error(
      "Synthetic data is disabled. Use ALLOW_SYNTHETIC_DEMO=true in a non-production environment only.",
    );
}
async function lease(work) {
  const owner = randomUUID(),
    key = `demo-lease:${DATASET}`;
  await Setting.updateOne(
    { key },
    { $setOnInsert: { value: {} } },
    { upsert: true },
  );
  const acquired = await Setting.findOneAndUpdate(
    {
      key,
      $or: [
        { "value.expires": { $lt: new Date() } },
        { "value.owner": { $exists: false } },
      ],
    },
    { $set: { value: { owner, expires: new Date(Date.now() + 3600000) } } },
    { new: true },
  );
  if (!acquired)
    throw Error(
      "Another demo seed/reset owns the one-hour lease. Wait for it to finish; do not run concurrent seeders.",
    );
  try {
    return await work();
  } finally {
    await Setting.updateOne(
      { key, "value.owner": owner },
      { $unset: { "value.owner": 1, "value.expires": 1 } },
    );
  }
}
export async function demoSummary() {
  const rows = await Incident.find({ demoDataset: DATASET });
  const counts = (field) =>
    rows.reduce((a, r) => {
      const key =
        field === "priority"
          ? ["Emergency (Critical)", "High", "Normal"][r.priority]
          : r[field];
      a[key] = (a[key] || 0) + 1;
      return a;
    }, {});
  return {
    dataset: DATASET,
    total: rows.length,
    categories: counts("category"),
    priorities: counts("priority"),
    statuses: counts("status"),
    zones: counts("zone"),
    notifications: await Notification.countDocuments({ demoDataset: DATASET }),
  };
}
async function markTimeline(reportId, plan) {
  await locked(async (session) => {
    const r = await Incident.findOne({
      reportId,
      demoDataset: DATASET,
    }).session(session);
    if (r.demoTimelineApplied) return;
    // Translate genuine transitions into a fictional historical training timeline.
    // No status, handler, routing decision or capacity reservation is invented.
    const duration = (25 + (plan.index % 96)) * 60000;
    const clock = (status) =>
      new Date(
        plan.createdAt.getTime() +
          {
            Pending: 0,
            Assigned: 120000,
            "In Progress": 600000,
            Resolved: duration,
          }[status],
      );
    const history = r.history.map((h) => ({
      ...h.toObject(),
      timestamp: clock(h.status),
    }));
    const last = clock(r.status);
    await Incident.collection.updateOne(
      { _id: r._id },
      {
        $set: {
          createdAt: plan.createdAt,
          updatedAt: last,
          history,
          demoTimelineApplied: true,
          ...(r.status === "Resolved" ? { resolvedAt: last } : {}),
        },
      },
      { session },
    );
    await Assignment.collection.updateMany(
      { reportId },
      {
        $set: {
          demoDataset: DATASET,
          createdAt: clock("Assigned"),
          assignedAt: clock("Assigned"),
          updatedAt: last,
        },
      },
      { session },
    );
    const events = await Audit.find({ reportId }).session(session);
    for (const a of events) {
      const time =
        a.action === "status"
          ? clock(a.newValue)
          : a.action === "dispatch"
            ? clock("Assigned")
            : plan.createdAt;
      await Audit.collection.updateOne(
        { _id: a._id },
        { $set: { demoDataset: DATASET, createdAt: time, updatedAt: time } },
        { session },
      );
    }
    await Notification.collection.updateMany(
      { reportId },
      {
        $set: {
          demoDataset: DATASET,
          createdAt: plan.createdAt,
          updatedAt: plan.createdAt,
        },
      },
      { session },
    );
  });
}
export async function seedDemonstration() {
  enabled();
  return lease(async () => {
    const existing = await Setting.findOne({ key: manifestKey });
    if (existing?.value.complete) {
      const summary = await demoSummary();
      if (summary.total !== 100)
        throw Error(
          "Completed dataset was modified. Use the explicit demo reset before recreating; no records were overwritten.",
        );
      return { ...summary, generated: 0 };
    }
    if (
      await Incident.exists({
        status: "Pending",
        demoDataset: { $ne: DATASET },
      })
    )
      throw Error(
        "Existing non-demo Pending incidents could be dispatched by seeding. Process those first; they were not modified.",
      );
    const admin = await User.findOne(
      existing?.value.owner
        ? { userId: existing.value.owner, role: "admin", active: true }
        : { role: "admin", active: true },
    );
    if (!admin)
      throw Error(
        "An existing active administrator is required. Run base provisioning separately if needed.",
      );
    const reporter = existing?.value.reporter
      ? await User.findOne({ userId: existing.value.reporter, active: true })
      : (await User.findOne({
          userId: "demo-staff",
          role: "staff",
          active: true,
        })) || admin;
    if (!reporter)
      throw Error(
        "The dataset reporter is inactive; refusing to create duplicate records with a different identity.",
      );
    const anchor = existing?.value.anchor
      ? new Date(existing.value.anchor)
      : new Date();
    const plan = demoPlan(anchor, await Route.find().lean());
    const token = jwt.sign({ sub: admin.userId }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    const reporterToken = jwt.sign(
      { sub: reporter.userId },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );
    const privateToken = randomUUID();
    app.locals.syntheticSeedToken = privateToken;
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    async function call(method, path, data, key) {
      const response = await fetch(base + path, {
        method,
        headers: {
          Authorization: `Bearer ${path === "/incidents" ? reporterToken : token}`,
          "Content-Type": "application/json",
          "X-Synthetic-Seed": privateToken,
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(30000),
      });
      const body = await response.json();
      if (!response.ok)
        throw Error(`${path}: ${body.error} ${(body.errors || []).join("; ")}`);
      return body;
    }
    let generated = 0;
    try {
      // Fail before writes if customized authoritative rules reject the proposed dataset.
      for (const item of plan) {
        const check = await call("POST", "/validation/simulate", item.data);
        if (!check.valid || check.category !== item.category)
          throw Error(
            `Synthetic scenario ${item.index + 1} conflicts with existing validation/classification rules. No configuration was changed.`,
          );
      }
      await Setting.updateOne(
        { key: manifestKey },
        {
          $setOnInsert: {
            value: {
              anchor: anchor.toISOString(),
              owner: admin.userId,
              reporter: reporter.userId,
              complete: false,
            },
          },
        },
        { upsert: true },
      );
      let activeIndex = 0;
      for (const item of plan) {
        const key = `${DATASET}:${String(item.index).padStart(3, "0")}`;
        let r = await Incident.findOne({
          idempotencyKey: `${reporter.userId}:${key}`,
        });
        if (!r) {
          r = await call("POST", "/incidents", item.data, key);
          generated++;
        }
        if (r.demoDataset !== DATASET)
          throw Error("Conflicting idempotency record; refusing to modify it");
        if (item.historical) {
          if (r.status === "Pending")
            throw Error(
              "Existing handler availability/capacity cannot process historical scenario. Restore eligible capacity and rerun; no capacity settings were changed.",
            );
          if (r.status === "Assigned")
            await call("PATCH", `/incidents/${r.reportId}/status`, {
              status: "In Progress",
            });
          if (r.status !== "Resolved")
            await call("PATCH", `/incidents/${r.reportId}/status`, {
              status: "Resolved",
            });
        } else if (r.status === "Assigned" || r.status === "In Progress") {
          if (activeIndex++ % 2 === 1 && r.status === "Assigned")
            await call("PATCH", `/incidents/${r.reportId}/status`, {
              status: "In Progress",
            });
        }
      }
      for (const item of plan) {
        const r = await Incident.findOne({
          idempotencyKey: `${reporter.userId}:${DATASET}:${String(item.index).padStart(3, "0")}`,
        });
        await markTimeline(r.reportId, item);
      }
      await Setting.updateOne(
        { key: manifestKey },
        { $set: { "value.complete": true } },
      );
      return { ...(await demoSummary()), generated };
    } finally {
      delete app.locals.syntheticSeedToken;
      await new Promise((resolve) => server.close(resolve));
    }
  });
}
export async function resetDemonstration() {
  enabled();
  return lease(() =>
    locked(async (session) => {
      const reports = await Incident.find({ demoDataset: DATASET }).session(
        session,
      );
      const ids = reports.map((r) => r.reportId);
      for (const r of reports.filter((r) =>
        ["Assigned", "In Progress"].includes(r.status),
      )) {
        const result = await Handler.updateOne(
          { handlerId: r.assignedHandler, currentLoad: { $gt: 0 } },
          { $inc: { currentLoad: -1 } },
          { session },
        );
        if (result.modifiedCount !== 1)
          throw Error(
            "Inconsistent handler load; reset aborted without partial deletion",
          );
      }
      for (const model of [Assignment, Notification, Audit])
        await model
          .deleteMany({ reportId: { $in: ids }, demoDataset: DATASET })
          .session(session);
      await Incident.deleteMany({
        reportId: { $in: ids },
        demoDataset: DATASET,
      }).session(session);
      await Setting.deleteOne({ key: manifestKey }).session(session);
      await Audit.create(
        [
          {
            eventId: randomUUID(),
            action: "synthetic-demo-reset",
            actorId: "demo-seed-cli",
            newValue: {
              dataset: DATASET,
              removed: ids.length,
              sqliteAudits:
                "Retained as labeled historical validation evidence",
            },
          },
        ],
        { session },
      );
      return {
        dataset: DATASET,
        removed: ids.length,
        sqliteAudits: "retained",
      };
    }),
  );
}
