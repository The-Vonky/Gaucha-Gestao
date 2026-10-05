// Fails when the production bundle is only the "environment not configured" shell
// or when it contains privileged key material. Run after `npm run build`.
import { readdirSync, readFileSync } from "node:fs";
const dir = "apps/web/dist/assets";
const bundle = readdirSync(dir)
  .filter((f) => f.endsWith(".js"))
  .map((f) => readFileSync(`${dir}/${f}`, "utf8"))
  .join("\n");
const required = {
  "Audit module": [
    "create_inspection",
    "finalize_inspection",
    "reopen_inspection",
    "Nova auditoria",
  ],
  "Action Plans module": [
    "create_manual_plan",
    "set_plan_status",
    "verify_plan",
    "Novo plano de ação",
  ],
  "Action Plan evidence": [
    "begin_evidence_upload",
    "confirm_evidence_upload",
    "action-plan-evidence",
  ],
  "Core administration": ["save_role", "my_access"],
};
// Key material only; supabase-js itself contains the bare "sb_secret_" prefix check.
const forbidden = [/service_role/, /sb_secret_[A-Za-z0-9_-]{8,}/];
const errors = [];
for (const [area, markers] of Object.entries(required))
  for (const m of markers)
    if (!bundle.includes(m)) errors.push(`${area} missing from bundle: ${m}`);
for (const f of forbidden)
  if (f.test(bundle)) errors.push(`Forbidden value in bundle: ${f}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  "Bundle contains the application (Audit, Action Plans, Core) and no privileged keys.",
);
