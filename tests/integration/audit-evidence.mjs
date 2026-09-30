import { db, state, setup } from "./audit-evidence-fixture.mjs";
import { runApi } from "./audit-evidence-api.mjs";
import { runDatabase } from "./audit-evidence-database.mjs";
import { runBrowser } from "./audit-evidence-browser.mjs";

try {
  await setup();
  await runApi();
  await runDatabase();
  await runBrowser();
  console.log("PASS Audit checklist evidence real local integration suite");
} catch (error) {
  // Assertion diffs can include actual response values; expose only a static phase and safe code.
  const code = /^[A-Z0-9_]{1,32}$/.test(String(error.code ?? "")) ? error.code : "CHECK_FAILED";
  console.error("FAIL Audit evidence integration: " + state.phase + "; code=" + code);
  process.exitCode = 1;
} finally {
  await db.end();
}
