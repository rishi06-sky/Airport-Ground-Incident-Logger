import "dotenv/config";
import mongoose from "mongoose";
import { validationUrl } from "./runtime-config.js";
import { recover } from "./recovery.js";
import { app } from "./app.js";
import { models, Setting } from "./models.js";
process.env.VALIDATION_URL = validationUrl(process.env);
if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32 ||
  !process.env.SERVICE_TOKEN
)
  throw Error("Configure JWT_SECRET (32+ characters) and SERVICE_TOKEN");
await mongoose.connect(process.env.MONGODB_URI);
await Promise.all(models.map((m) => m.init()));
await Setting.updateOne(
  { key: "dispatch-lock" },
  { $setOnInsert: { value: { revision: 0 } } },
  { upsert: true },
);
app.listen(process.env.PORT || 3001, "0.0.0.0", () =>
  console.log("AGIL API ready"),
);

recover().catch(() => {});
setInterval(() => recover().catch(() => {}), 15000).unref();
