import { readFileSync } from "node:fs";
import { parseArguments } from "./local.mjs";

export function buildSeedSql(userId = "") {
  // Never interpolate an unchecked CLI value into SQL.
  parseArguments(userId ? ["--user-id", userId] : []);
  return readFileSync(new URL("./seed.sql", import.meta.url), "utf8")
    .replace("__AUDIT_DEMO_USER_ID__", userId);
}
