import mongoose from "mongoose";
const { Schema } = mongoose;
function model(name, fields, indexes = []) {
  const s = new Schema(fields, { timestamps: true, strict: true });
  for (const [key, opts] of indexes) s.index(key, opts);
  return mongoose.model(name, s);
}
export const User = model("User", {
  userId: { type: String, unique: true },
  name: String,
  email: { type: String, unique: true },
  passwordHash: String,
  role: { type: String, enum: ["staff", "supervisor", "safety", "admin"] },
  assignedTeam: String,
  active: { type: Boolean, default: true },
});
export const Handler = model("Handler", {
  handlerId: { type: String, unique: true },
  teamId: { type: String, unique: true },
  name: String,
  zone: String,
  available: Boolean,
  capacity: Number,
  currentLoad: { type: Number, default: 0 },
});
export const Route = model("RoutingRule", {
  carrierCode: { type: String, unique: true },
  teamName: String,
  zone: String,
  supervisor: String,
  teamId: String,
  backupTeamId: String,
  escalationAuthority: String,
});
export const Incident = model(
  "Incident",
  {
    reportId: { type: String, unique: true },
    reporterId: String,
    demoDataset: String,
    demoTimelineApplied: Boolean,
    originalData: Schema.Types.Mixed,
    aircraftRegistration: String,
    incidentCode: String,
    carrierCode: String,
    zone: String,
    description: String,
    urgency: String,
    occurredAt: Date,
    contact: String,
    reporterName: String,
    attachment: String,
    validationResult: Schema.Types.Mixed,
    validationAuditLinked: { type: Boolean, default: false },
    matchedCategories: [String],
    category: String,
    priority: Number,
    status: { type: String, default: "Pending" },
    assignedHandler: String,
    routingDecision: String,
    history: [{ status: String, actorId: String, timestamp: Date }],
    resolvedAt: Date,
    idempotencyKey: { type: String, unique: true },
  },
  [
    [{ priority: 1, createdAt: 1, reportId: 1 }, {}],
    [{ reporterId: 1, status: 1 }, {}],
  ],
);
export const Assignment = model("Assignment", {
  demoDataset: String,
  reportId: { type: String, unique: true },
  handlerId: String,
  team: String,
  zone: String,
  priority: Number,
  assignedAt: Date,
  assignmentStatus: String,
  routingDecision: String,
});
export const Notification = model("Notification", {
  demoDataset: String,
  notificationId: { type: String, unique: true },
  reportId: String,
  recipientId: String,
  notificationType: String,
  deliveryStatus: String,
  emailStatus: { type: String, default: "Not configured" },
  emailAttempts: { type: Number, default: 0 },
  emailClaimedAt: Date,
  read: { type: Boolean, default: false },
});
export const Audit = model("AuditLog", {
  demoDataset: String,
  eventId: String,
  reportId: String,
  action: String,
  actorId: String,
  previousValue: Schema.Types.Mixed,
  newValue: Schema.Types.Mixed,
});
export const Setting = model("Setting", {
  key: { type: String, unique: true },
  value: Schema.Types.Mixed,
});
export const Counter = model("Counter", { _id: String, value: Number });
export const models = [
  User,
  Handler,
  Route,
  Incident,
  Assignment,
  Notification,
  Audit,
  Setting,
  Counter,
];
