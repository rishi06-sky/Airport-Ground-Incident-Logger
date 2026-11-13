import { randomBytes } from "node:crypto";
import fs from "node:fs";
if (!fs.existsSync(".env")) {
  fs.writeFileSync(
    ".env",
    `MONGODB_URI=mongodb://127.0.0.1:27017/agil?replicaSet=agil\nJWT_SECRET=${randomBytes(48).toString("hex")}\nSERVICE_TOKEN=${randomBytes(32).toString("hex")}\nDEMO_PASSWORD=${randomBytes(18).toString("base64url")}\nVALIDATION_URL=http://127.0.0.1:5001\nVALIDATION_DB=${process.cwd()}/.data/validation.sqlite\nUPLOAD_DIR=${process.cwd()}/.data/uploads\nPORT=3001\n`,
    { mode: 0o600 },
  );
  console.log(
    "Created ignored .env with random local secrets. Demo password is available in this local file.",
  );
} else console.log("Preserving existing .env");
