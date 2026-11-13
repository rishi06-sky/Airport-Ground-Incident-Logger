import nodemailer from "nodemailer";
import { Incident, Notification, User } from "./models.js";
let running = false;
export async function recover() {
  if (running) return;
  running = true;
  try {
    for (const report of await Incident.find({
      validationAuditLinked: false,
    }).limit(100)) {
      try {
        const r = await fetch(
          `${process.env.VALIDATION_URL || "http://127.0.0.1:5001"}/audit/link`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Service-Token": process.env.SERVICE_TOKEN,
            },
            body: JSON.stringify({
              validationId: report.validationResult.validationId,
              reportId: report.reportId,
            }),
            signal: AbortSignal.timeout(3000),
          },
        );
        if (r.ok)
          await Incident.updateOne(
            { _id: report._id },
            { $set: { validationAuditLinked: true } },
          );
      } catch {
        /* Retain durable pending link for next recovery run. */
      }
    }
    if (process.env.SMTP_HOST && process.env.SMTP_FROM) {
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 465),
        secure: process.env.SMTP_PORT !== "587",
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
      for (let n = 0; n < 20; n++) {
        const notification = await Notification.findOneAndUpdate(
          {
            demoDataset: { $exists: false },
            emailAttempts: { $lt: 5 },
            emailStatus: { $nin: ["Sent", "Synthetic — in-app only"] },
            $or: [
              { emailClaimedAt: { $exists: false } },
              { emailClaimedAt: { $lt: new Date(Date.now() - 60000) } },
            ],
          },
          {
            $set: { emailClaimedAt: new Date(), emailStatus: "Sending" },
            $inc: { emailAttempts: 1 },
          },
          { new: true },
        );
        if (!notification) break;
        const recipient = await User.findOne({
          userId: notification.recipientId,
          active: true,
        });
        try {
          if (!recipient) throw Error("Recipient inactive");
          await transport.sendMail({
            from: process.env.SMTP_FROM,
            to: recipient.email,
            subject: `AGIL safety incident ${notification.reportId}`,
            text: `Safety-Breach incident ${notification.reportId} requires review. Sign in to the safety center.`,
            messageId: `<${notification.notificationId}@agil.local>`,
          });
          notification.emailStatus = "Sent";
        } catch {
          notification.emailStatus =
            "Failed; in-app notification remains available";
        }
        await notification.save();
      }
      transport.close();
    }
  } finally {
    running = false;
  }
}
