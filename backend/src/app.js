import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import mongoose from "mongoose";
import {
  User,
  Handler,
  Route,
  Incident,
  Assignment,
  Notification,
  Audit,
  Setting,
  Counter,
} from "./models.js";
import { locked, drain, dispatch } from "./dispatch.js";
export const app = express();
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 0));
app.use(helmet());
app.use(express.json({ limit: "128kb" }));
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.set("X-Request-ID", req.requestId);
  next();
});
const fail = (status, message) => Object.assign(new Error(message), { status });
const guard = (roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : next(fail(403, "Permission denied"));
const admin = guard(["admin"]);
const audit = async (req, action, old, value, reportId, session) =>
  Audit.create(
    [
      {
        eventId: randomUUID(),
        reportId,
        action,
        actorId: req.user.userId,
        previousValue: old,
        newValue: value,
      },
    ],
    { session },
  );
export async function validate(data, preview = false) {
  const setting = await Setting.findOne({ key: "keywords" });
  const business = await Setting.findOne({ key: "businessRules" });
  const response = await fetch(
    `${process.env.VALIDATION_URL || "http://127.0.0.1:5001"}/validate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Token": process.env.SERVICE_TOKEN,
        "X-Request-ID": data.requestId || randomUUID(),
      },
      body: JSON.stringify({
        ...data,
        keywords: setting?.value,
        businessRules: business?.value,
        audit: !preview,
      }),
      signal: AbortSignal.timeout(5000),
    },
  ).catch(() => {
    throw fail(
      503,
      "Validation service unavailable; report was not dispatched. Retry safely.",
    );
  });
  if (!response.ok) throw fail(503, "Validation service rejected the request");
  return response.json();
}
app.get("/api/health", async (req, res) => {
  const python = await fetch(
    `${process.env.VALIDATION_URL || "http://127.0.0.1:5001"}/health`,
    { signal: AbortSignal.timeout(2000) },
  ).catch(() => null);
  const ready = mongoose.connection.readyState === 1 && python?.ok;
  res.status(ready ? 200 : 503).json({
    status: ready ? "ok" : "degraded",
    mongo: mongoose.connection.readyState === 1,
    validation: !!python?.ok,
  });
});
app.post(
  "/api/auth/login",
  rateLimit({ windowMs: 60000, limit: 20 }),
  async (req, res) => {
    const user = await User.findOne({
      email: String(req.body.email || "").toLowerCase(),
      active: true,
    });
    if (
      !user ||
      !(await bcrypt.compare(
        String(req.body.password || ""),
        user.passwordHash,
      ))
    )
      throw fail(401, "Invalid credentials");
    res.json({
      token: jwt.sign({ sub: user.userId }, process.env.JWT_SECRET, {
        expiresIn: "8h",
      }),
    });
  },
);
app.use("/api", async (req, res, next) => {
  try {
    const claims = jwt.verify(
      (req.headers.authorization || "").replace(/^Bearer /, ""),
      process.env.JWT_SECRET,
      { algorithms: ["HS256"] },
    );
    const user = await User.findOne({
      userId: claims.sub,
      active: true,
    }).select("-passwordHash");
    if (!user) throw Error();
    req.user = user;
    next();
  } catch {
    next(fail(401, "Authentication required"));
  }
});
app.get("/api/auth/me", (req, res) => res.json(req.user));
function scope(user) {
  if (user.role === "staff") return { reporterId: user.userId };
  if (user.role === "safety")
    return { $or: [{ category: "Safety-Breach" }, { priority: 0 }] };
  if (user.role === "supervisor") return { assignedHandler: user.assignedTeam };
  return {};
}
async function permitted(req) {
  const i = await Incident.findOne({
    reportId: req.params.id,
    ...scope(req.user),
  });
  if (!i) throw fail(404, "Incident not found");
  return i;
}
app.post(
  ["/api/validation/check", "/api/validation/classify"],
  async (req, res) =>
    res.json(
      await validate({
        ...req.body,
        reportId: undefined,
        requestId: req.requestId,
      }),
    ),
);
app.post("/api/validation/simulate", async (req, res) =>
  res.json(
    await validate(
      { ...req.body, reportId: undefined, requestId: req.requestId },
      true,
    ),
  ),
);
const uploadRoot = process.env.UPLOAD_DIR || ".data/uploads";
fs.mkdirSync(uploadRoot, { recursive: true });
const upload = multer({
  dest: uploadRoot,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    ["image/png", "image/jpeg", "application/pdf"].includes(file.mimetype)
      ? cb(null, true)
      : cb(fail(422, "Attachment must be PNG, JPEG or PDF")),
});
app.post(
  "/api/incidents",
  guard(["staff", "admin"]),
  upload.single("attachment"),
  async (req, res) => {
    const data = req.body;
    // Only the opt-in, loopback seeder can tag trusted synthetic records.
    const demoDataset =
      ["admin", "staff"].includes(req.user.role) &&
      app.locals.syntheticSeedToken &&
      req.headers["x-synthetic-seed"] === app.locals.syntheticSeedToken &&
      data.demoDataset === "agil-synthetic-v1"
        ? data.demoDataset
        : undefined;
    const key = req.headers["idempotency-key"];
    if (!key || key.length > 100)
      throw fail(400, "A unique Idempotency-Key is required");
    const duplicate = await Incident.findOne({
      idempotencyKey: `${req.user.userId}:${key}`,
    });
    if (duplicate) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.json(duplicate);
    }
    const required = [
      "reporterName",
      "contact",
      "aircraftRegistration",
      "incidentCode",
      "carrierCode",
      "zone",
      "description",
      "urgency",
      "occurredAt",
    ];
    const errors = required
      .filter((k) => typeof data[k] !== "string" || !data[k].trim())
      .map((k) => `${k} is required`);
    if (data.description?.length > 5000)
      errors.push("Description must be at most 5000 characters");
    if (!["Normal", "High", "Critical"].includes(data.urgency))
      errors.push("Invalid urgency");
    if (!Number.isFinite(Date.parse(data.occurredAt)))
      errors.push("Invalid incident date");
    const validation = await validate({ ...data, requestId: req.requestId });
    if (!validation.valid || errors.length) {
      await audit(req, "rejected-report", null, {
        originalData: data,
        validation,
        errors,
      });
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(422).json({
        error: "Report rejected",
        errors: [...errors, ...validation.errors],
        validation,
      });
    }
    const year = new Date().getUTCFullYear();
    let report;
    try {
      await locked(async (session) => {
        const counter = await Counter.findOneAndUpdate(
          { _id: String(year) },
          { $inc: { value: 1 } },
          { upsert: true, new: true, session },
        );
        const reportId = `AGIL-${year}-${String(counter.value).padStart(6, "0")}`;
        [report] = await Incident.create(
          [
            {
              reportId,
              reporterId: req.user.userId,
              demoDataset,
              originalData: data,
              ...Object.fromEntries(required.map((k) => [k, data[k]])),
              attachment: req.file?.filename,
              validationResult: validation,
              matchedCategories: validation.matchedCategories,
              category: validation.category,
              priority: validation.priority,
              idempotencyKey: `${req.user.userId}:${key}`,
              history: [
                {
                  status: "Pending",
                  actorId: req.user.userId,
                  timestamp: new Date(),
                },
              ],
            },
          ],
          { session },
        );
        if (validation.category === "Safety-Breach") {
          const officers = await User.find({
            role: "safety",
            active: true,
          }).session(session);
          await Notification.create(
            (officers.length ? officers : [{ userId: "safety-role" }]).map(
              (o) => ({
                notificationId: randomUUID(),
                demoDataset,
                ...(demoDataset
                  ? { emailStatus: "Synthetic — in-app only" }
                  : {}),
                reportId,
                recipientId: o.userId,
                notificationType: "Safety-Breach",
                deliveryStatus: "Delivered in-app",
              }),
            ),
            { session },
          );
        }
        await Audit.create(
          [
            {
              eventId: randomUUID(),
              reportId,
              action: "submitted",
              demoDataset,
              actorId: req.user.userId,
              newValue: data,
            },
          ],
          { session },
        );
        await drain(session, req.user.userId);
      });
    } catch (e) {
      if (e.code === 11000) {
        const existing = await Incident.findOne({
          idempotencyKey: `${req.user.userId}:${key}`,
        });
        if (existing) {
          if (req.file) fs.unlinkSync(req.file.path);
          return res.json(existing);
        }
      }
      throw e;
    }
    req.file = undefined;
    res.status(201).json(await Incident.findById(report._id));
  },
);
app.get("/api/incidents", async (req, res) => {
  const filters = [scope(req.user)];
  for (const key of ["category", "status"])
    if (req.query[key]) filters.push({ [key]: req.query[key] });
  if (req.query.search) {
    const term = String(req.query.search).replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    filters.push({
      $or: [
        { reportId: { $regex: term, $options: "i" } },
        { aircraftRegistration: { $regex: term, $options: "i" } },
      ],
    });
  }
  const dates = {};
  if (req.query.from && Number.isFinite(Date.parse(req.query.from)))
    dates.$gte = new Date(req.query.from);
  if (req.query.to && Number.isFinite(Date.parse(req.query.to)))
    dates.$lte = new Date(
      String(req.query.to).length === 10
        ? `${req.query.to}T23:59:59.999Z`
        : req.query.to,
    );
  if (Object.keys(dates).length) filters.push({ createdAt: dates });
  res.json(
    await Incident.find({ $and: filters })
      .sort({ priority: 1, createdAt: -1 })
      .limit(1000),
  );
});
app.get("/api/incidents/:id", async (req, res) => {
  const incident = await permitted(req);
  res.json({
    incident,
    assignment: await Assignment.findOne({ reportId: incident.reportId }),
    audit: await Audit.find({ reportId: incident.reportId }).sort({
      createdAt: 1,
    }),
  });
});
app.get("/api/incidents/:id/attachment", async (req, res) => {
  const i = await permitted(req);
  if (!i.attachment) throw fail(404, "No attachment");
  res.download(`${uploadRoot}/${i.attachment}`, "supporting-attachment", {
    dotfiles: "allow",
  });
});
app.patch(
  "/api/incidents/:id/status",
  guard(["admin", "supervisor"]),
  async (req, res) => {
    await locked(async (session) => {
      const i = await Incident.findOne({
        reportId: req.params.id,
        ...scope(req.user),
      }).session(session);
      if (!i) throw fail(404, "Incident not found");
      const next = { Assigned: "In Progress", "In Progress": "Resolved" }[
        i.status
      ];
      if (req.body.status !== next || !next)
        throw fail(409, "Valid transitions: Assigned → In Progress → Resolved");
      const old = i.status;
      i.status = next;
      i.history.push({
        status: next,
        actorId: req.user.userId,
        timestamp: new Date(),
      });
      if (next === "Resolved") {
        i.resolvedAt = new Date();
        await Handler.updateOne(
          { handlerId: i.assignedHandler, currentLoad: { $gt: 0 } },
          { $inc: { currentLoad: -1 } },
          { session },
        );
      }
      await i.save({ session });
      await Assignment.updateOne(
        { reportId: i.reportId },
        { $set: { assignmentStatus: next } },
        { session },
      );
      await Audit.create(
        [
          {
            eventId: randomUUID(),
            reportId: i.reportId,
            action: "status",
            demoDataset: i.demoDataset,
            actorId: req.user.userId,
            previousValue: old,
            newValue: next,
          },
        ],
        { session },
      );
      await drain(session, req.user.userId);
    });
    res.json({ ok: true });
  },
);
app.get(
  "/api/routing",
  guard(["admin", "supervisor", "safety"]),
  async (req, res) => res.json(await Route.find()),
);
app.post("/api/routing/dispatch", admin, async (req, res) => {
  await dispatch(req.user.userId);
  res.json({ ok: true });
});
app.patch("/api/routing/:id", admin, async (req, res) => {
  const allowed = [
    "zone",
    "teamId",
    "backupTeamId",
    "supervisor",
    "escalationAuthority",
  ];
  const patch = Object.fromEntries(
    allowed
      .filter((k) => typeof req.body[k] === "string" && req.body[k].trim())
      .map((k) => [k, req.body[k]]),
  );
  for (const key of ["teamId", "backupTeamId"])
    if (patch[key] && !(await Handler.exists({ teamId: patch[key] })))
      throw fail(422, "Unknown team");
  await locked(async (session) => {
    const previous = await Route.findByIdAndUpdate(
      req.params.id,
      { $set: patch },
      { session },
    );
    if (!previous) throw fail(404, "Route not found");
    await Audit.create(
      [
        {
          eventId: randomUUID(),
          action: "route-update",
          actorId: req.user.userId,
          previousValue: previous,
          newValue: patch,
        },
      ],
      { session },
    );
    await drain(session);
  });
  res.json({ ok: true });
});
app.get(
  "/api/handlers",
  guard(["admin", "supervisor", "safety"]),
  async (req, res) =>
    res.json(
      await Handler.find(
        req.user.role === "supervisor"
          ? { handlerId: req.user.assignedTeam }
          : {},
      ),
    ),
);
for (const field of ["availability", "capacity"])
  app.patch(
    `/api/handlers/:id/${field}`,
    guard(["admin", "supervisor"]),
    async (req, res) => {
      if (field === "capacity" && req.user.role !== "admin")
        throw fail(403, "Administrator required");
      const value = req.body[field];
      if (
        field === "availability"
          ? typeof value !== "boolean"
          : !Number.isInteger(value) || value < 1 || value > 100
      )
        throw fail(422, "Invalid handler setting");
      await locked(async (session) => {
        const h = await Handler.findOne({
          handlerId: req.params.id,
          ...(req.user.role === "supervisor"
            ? { handlerId: req.user.assignedTeam }
            : {}),
        }).session(session);
        if (!h) throw fail(404, "Handler not found");
        if (field === "capacity" && value < h.currentLoad)
          throw fail(409, "Capacity cannot be lower than current workload");
        const old = h.toObject();
        h[field === "availability" ? "available" : "capacity"] = value;
        await h.save({ session });
        await Audit.create(
          [
            {
              eventId: randomUUID(),
              action: `handler-${field}`,
              actorId: req.user.userId,
              previousValue: old,
              newValue: h.toObject(),
            },
          ],
          { session },
        );
        await drain(session);
      });
      res.json({ ok: true });
    },
  );
app.get("/api/notifications", guard(["safety", "admin"]), async (req, res) =>
  res.json(
    await Notification.find(
      req.user.role === "admin"
        ? {}
        : { recipientId: { $in: [req.user.userId, "safety-role"] } },
    ).sort({ createdAt: -1 }),
  ),
);
app.patch(
  "/api/notifications/:id/read",
  guard(["safety", "admin"]),
  async (req, res) => {
    const n = await Notification.findOneAndUpdate(
      {
        notificationId: req.params.id,
        ...(req.user.role === "admin"
          ? {}
          : { recipientId: { $in: [req.user.userId, "safety-role"] } }),
      },
      { $set: { read: true } },
      { new: true },
    );
    if (!n) throw fail(404, "Notification not found");
    res.json(n);
  },
);
app.get(
  ["/api/dashboard/summary", "/api/dashboard/analytics"],
  async (req, res) => {
    const filter = scope(req.user);
    for (const key of ["from", "to"])
      if (req.query[key] && !Number.isFinite(Date.parse(req.query[key])))
        throw fail(422, "Invalid date filter");
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to)
        filter.createdAt.$lte = new Date(
          String(req.query.to).length === 10
            ? `${req.query.to}T23:59:59.999Z`
            : req.query.to,
        );
    }
    const rows = await Incident.find(filter);
    const counts = (key) =>
      Object.entries(
        rows.reduce((a, r) => {
          const k =
            key === "day" ? r.createdAt.toISOString().slice(0, 10) : r[key];
          a[k] = (a[k] || 0) + 1;
          return a;
        }, {}),
      ).map(([name, value]) => ({ name, value }));
    const resolved = rows.filter((r) => r.status === "Resolved");
    res.json({
      total: rows.length,
      resolved: resolved.length,
      unresolved: rows.length - resolved.length,
      critical: rows.filter((r) => r.priority === 0).length,
      averageResolutionMinutes: resolved.length
        ? resolved.reduce(
            (s, r) => s + (r.resolvedAt - r.createdAt) / 60000,
            0,
          ) / resolved.length
        : 0,
      status: counts("status"),
      categories: counts("category"),
      zones: counts("zone"),
      priorities: counts("priority"),
      timeline: counts("day"),
      workload: ["admin", "safety"].includes(req.user.role)
        ? await Handler.find()
        : [],
    });
  },
);
app.get("/api/admin/users", admin, async (req, res) =>
  res.json(await User.find().select("-passwordHash")),
);
app.post("/api/admin/users", admin, async (req, res) => {
  const { name, email, password, role, assignedTeam } = req.body;
  if (
    !name ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    typeof password !== "string" ||
    password.length < 12 ||
    !["staff", "supervisor", "safety", "admin"].includes(role)
  )
    throw fail(
      422,
      "Name, email, role and password of at least 12 characters required",
    );
  if (
    role === "supervisor" &&
    !(await Handler.exists({ handlerId: assignedTeam }))
  )
    throw fail(422, "Supervisor requires a valid handler ID");
  const passwordHash = await bcrypt.hash(password, 12);
  let user;
  await locked(async (session) => {
    [user] = await User.create(
      [
        {
          userId: randomUUID(),
          name,
          email: email.toLowerCase(),
          passwordHash,
          role,
          assignedTeam,
        },
      ],
      { session },
    );
    await audit(
      req,
      "user-created",
      null,
      { userId: user.userId, role },
      undefined,
      session,
    );
  });
  res.status(201).json({ userId: user.userId });
});
app.patch("/api/admin/users/:id", admin, async (req, res) => {
  const patch = {};
  for (const k of ["role", "assignedTeam", "active"])
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  if (
    patch.role &&
    !["staff", "supervisor", "safety", "admin"].includes(patch.role)
  )
    throw fail(422, "Invalid role");
  if (patch.active !== undefined && typeof patch.active !== "boolean")
    throw fail(422, "active must be boolean");
  if (req.params.id === req.user.userId)
    throw fail(409, "Cannot change your own account");
  const u = await User.findOne({ userId: req.params.id });
  if (!u) throw fail(404, "User not found");
  if (
    (patch.role || u.role) === "supervisor" &&
    !(await Handler.exists({ handlerId: patch.assignedTeam || u.assignedTeam }))
  )
    throw fail(422, "Valid handler ID required");
  await locked(async (session) => {
    await User.updateOne(
      { userId: req.params.id },
      { $set: patch },
      { session },
    );
    await audit(
      req,
      "user-updated",
      { role: u.role, active: u.active },
      patch,
      undefined,
      session,
    );
  });
  res.json({ ok: true });
});
app.get("/api/admin/audit", admin, async (req, res) =>
  res.json(await Audit.find().sort({ createdAt: -1 }).limit(500)),
);
app.get("/api/admin/business-rules", admin, async (req, res) =>
  res.json(
    (await Setting.findOne({ key: "businessRules" }))?.value || {
      supportedAircraft: [],
      supportedCodes: [],
      aircraftCarriers: {},
    },
  ),
);
app.put("/api/admin/business-rules", admin, async (req, res) => {
  const rules = req.body;
  if (
    !Array.isArray(rules.supportedAircraft) ||
    !Array.isArray(rules.supportedCodes) ||
    !rules.aircraftCarriers ||
    typeof rules.aircraftCarriers !== "object" ||
    Array.isArray(rules.aircraftCarriers) ||
    rules.supportedAircraft.some((x) => typeof x !== "string") ||
    rules.supportedCodes.some((x) => typeof x !== "string") ||
    Object.values(rules.aircraftCarriers).some(
      (x) => !["AI", "6E", "SG", "UK", "OTHER"].includes(x),
    )
  )
    throw fail(
      422,
      "Provide supportedAircraft, supportedCodes arrays and aircraftCarriers mapping",
    );
  await locked(async (session) => {
    const old = await Setting.findOneAndUpdate(
      { key: "businessRules" },
      { $set: { value: rules } },
      { upsert: true, session },
    );
    await audit(
      req,
      "business-rules-updated",
      old?.value,
      rules,
      undefined,
      session,
    );
  });
  res.json({ ok: true });
});
app.get("/api/admin/settings", admin, async (req, res) => {
  const saved = await Setting.findOne({ key: "keywords" });
  if (saved) return res.json(saved);
  const r = await fetch(
    `${process.env.VALIDATION_URL || "http://127.0.0.1:5001"}/defaults`,
    {
      headers: { "X-Service-Token": process.env.SERVICE_TOKEN },
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!r.ok) throw fail(503, "Classification defaults unavailable");
  res.json({ value: await r.json() });
});
app.put("/api/admin/settings", admin, async (req, res) => {
  const check = await fetch(
    `${process.env.VALIDATION_URL || "http://127.0.0.1:5001"}/validate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Token": process.env.SERVICE_TOKEN,
      },
      body: JSON.stringify({ keywords: req.body }),
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!check.ok)
    throw fail(
      422,
      "Exactly five categories with nonempty keyword arrays required",
    );
  await locked(async (session) => {
    const previous = await Setting.findOneAndUpdate(
      { key: "keywords" },
      { $set: { value: req.body } },
      { upsert: true, session },
    );
    await audit(
      req,
      "keywords-updated",
      previous?.value,
      req.body,
      undefined,
      session,
    );
  });
  res.json({ ok: true });
});
app.use((req, res, next) => next(fail(404, "API endpoint not found")));
app.use((err, req, res, next) => {
  if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
  if (err.name === "CastError") err = fail(400, "Invalid record identifier");
  res
    .status(
      err.status ||
        (err.code === "LIMIT_FILE_SIZE" ? 413 : err.code === 11000 ? 409 : 500),
    )
    .json({
      error: err.status
        ? err.message
        : err.code === "LIMIT_FILE_SIZE"
          ? "Attachment exceeds 5 MB"
          : err.code === 11000
            ? "Duplicate record"
            : "Internal service error",
      requestId: req.requestId,
    });
});
