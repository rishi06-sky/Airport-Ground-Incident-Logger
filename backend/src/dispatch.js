import mongoose from "mongoose";
import { Incident, Handler, Route, Assignment, Audit } from "./models.js";
import { randomUUID } from "node:crypto";
// All dispatchers and capacity mutations contend on the same MongoDB document.
// Transactions retry write conflicts; no process-local lock is relied on.
import { Setting } from "./models.js";
export async function locked(work) {
  return mongoose.connection.transaction(async (session) => {
    await Setting.updateOne(
      { key: "dispatch-lock" },
      { $inc: { "value.revision": 1 } },
      { session },
    );
    return work(session);
  });
}
export async function drain(session, actor = "system") {
  const queue = await Incident.find({ status: "Pending" })
    .sort({ priority: 1, createdAt: 1, reportId: 1 })
    .session(session);
  for (const report of queue) {
    const route = await Route.findOne({
      carrierCode: report.carrierCode,
    }).session(session);
    if (!route || report.zone !== route.zone) {
      report.routingDecision =
        "Correction queue: unknown carrier or zone for configured route";
      await report.save({ session });
      continue;
    }
    let handler = null,
      decision = "Primary route";
    for (const team of [route.teamId, route.backupTeamId].filter(Boolean)) {
      handler = await Handler.findOneAndUpdate(
        {
          teamId: team,
          available: true,
          $expr: { $lt: ["$currentLoad", "$capacity"] },
        },
        { $inc: { currentLoad: 1 } },
        { new: true, session },
      );
      if (handler) {
        if (team !== route.teamId)
          decision = "Backup team: primary unavailable or full";
        break;
      }
    }
    if (!handler) {
      report.routingDecision = `Waiting queue: no available capacity; escalated to ${route.escalationAuthority}`;
      await report.save({ session });
      continue;
    }
    report.status = "Assigned";
    report.assignedHandler = handler.handlerId;
    report.routingDecision =
      (report.priority === 0 ? "Emergency priority override. " : "") + decision;
    report.history.push({
      status: "Assigned",
      actorId: actor,
      timestamp: new Date(),
    });
    await report.save({ session });
    await Assignment.create(
      [
        {
          reportId: report.reportId,
          demoDataset: report.demoDataset,
          handlerId: handler.handlerId,
          team: handler.teamId,
          zone: report.zone,
          priority: report.priority,
          assignedAt: new Date(),
          assignmentStatus: "Assigned",
          routingDecision: report.routingDecision,
        },
      ],
      { session },
    );
    await Audit.create(
      [
        {
          eventId: randomUUID(),
          reportId: report.reportId,
          demoDataset: report.demoDataset,
          action: "dispatch",
          actorId: actor,
          newValue: {
            handlerId: handler.handlerId,
            decision: report.routingDecision,
          },
        },
      ],
      { session },
    );
  }
}
export async function dispatch(actor) {
  return locked((s) => drain(s, actor));
}
