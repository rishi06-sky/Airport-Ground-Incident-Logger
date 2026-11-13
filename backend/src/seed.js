import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User, Handler, Route, Setting, models } from "./models.js";
export async function seed(password) {
  if (!password || password.length < 12)
    throw Error("DEMO_PASSWORD must contain 12+ characters");
  await Promise.all(models.map((m) => m.init()));
  for (const [index, carrier] of ["AI", "6E", "SG", "UK", "OTHER"].entries()) {
    const zone = "ABCDE"[index],
      teamId = `TEAM-${carrier}`,
      handlerId = `H-${carrier}`;
    await Handler.updateOne(
      { handlerId },
      {
        $setOnInsert: {
          teamId,
          name: [
            "Air India Ground Handling",
            "IndiGo Ground Handling",
            "SpiceJet Ground Handling",
            "Airline Team 4",
            "General Ground Handling Pool",
          ][index],
          zone,
          available: true,
          capacity: 2,
          currentLoad: 0,
        },
      },
      { upsert: true },
    );
    await Route.updateOne(
      { carrierCode: carrier },
      {
        $setOnInsert: {
          teamName: [
            "Air India Ground Handling",
            "IndiGo Ground Handling",
            "SpiceJet Ground Handling",
            "Airline Team 4",
            "General Ground Handling Pool",
          ][index],
          zone,
          supervisor: `Fictional supervisor ${zone}`,
          teamId,
          backupTeamId: carrier === "OTHER" ? "TEAM-AI" : "TEAM-OTHER",
          escalationAuthority: "Airport Operations Control",
        },
      },
      { upsert: true },
    );
  }
  for (const [role, name, assignedTeam] of [
    ["admin", "Alex Morgan"],
    ["staff", "Sam Patel"],
    ["supervisor", "Taylor Reed", "H-AI"],
    ["safety", "Jordan Lee"],
  ])
    await User.updateOne(
      { email: `${role}@agil.test` },
      {
        $setOnInsert: {
          userId: `demo-${role}`,
          name,
          email: `${role}@agil.test`,
          role,
          assignedTeam,
          passwordHash: await bcrypt.hash(password, 12),
        },
      },
      { upsert: true },
    );
  await Setting.updateOne(
    { key: "dispatch-lock" },
    { $setOnInsert: { value: { revision: 0 } } },
    { upsert: true },
  );
}
if (process.argv[1]?.endsWith("/seed.js")) {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const mode = process.argv[2];
    if (mode === "--incidents" || mode === "--reset-demo") {
      const { seedDemonstration, resetDemonstration } =
        await import("./demo-seed.js");
      console.log(
        JSON.stringify(
          await (mode === "--incidents"
            ? seedDemonstration()
            : resetDemonstration()),
          null,
          2,
        ),
      );
    } else if (mode) throw Error("Usage: seed.js [--incidents | --reset-demo]");
    else {
      await seed(process.env.DEMO_PASSWORD);
      console.log(
        "Fictional teams and controlled demo accounts provisioned; no incidents seeded.",
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
