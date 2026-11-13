import mongoose from "mongoose";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { Incident, Assignment, Handler } from "../backend/src/models.js";
await mongoose.connect(process.env.MONGODB_URI);
const snapshot = {
  incidents: await Incident.countDocuments(),
  assignments: await Assignment.countDocuments(),
  loads: (await Handler.find().sort({ handlerId: 1 })).map((h) => [
    h.handlerId,
    h.currentLoad,
  ]),
};
await mongoose.disconnect();
const sqlite = execFileSync(
  ".venv/bin/python",
  [
    "-c",
    'import sqlite3,os,json; c=sqlite3.connect(os.environ["VALIDATION_DB"]); print(json.dumps(c.execute("select count(*) from ValidationAudit").fetchone()[0]))',
  ],
  { encoding: "utf8" },
).trim();
snapshot.validationAudit = Number(sqlite);
if (process.argv[2] === "capture") {
  fs.writeFileSync(".data/persistence-before.json", JSON.stringify(snapshot));
  console.log("Captured durable MongoDB and SQLite counts.");
} else {
  const before = JSON.parse(
    fs.readFileSync(".data/persistence-before.json", "utf8"),
  );
  if (JSON.stringify(before) !== JSON.stringify(snapshot))
    throw Error("Persistence mismatch across restart");
  console.log(
    "PASS: incident, assignment, handler load and SQLite audit counts survived restart.",
  );
}
