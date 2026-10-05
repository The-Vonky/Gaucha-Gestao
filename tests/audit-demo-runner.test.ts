import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { expect, it } from "vitest";

// Simulate only the external Docker/CLI boundary. The SQL, domain side effects,
// grants and RLS are exercised separately against PostgreSQL, without mocks.
it.skipIf(process.platform === "win32")("keeps writes on the validated local daemon when another operator changes Docker context", () => {
  const dir = mkdtempSync(join(tmpdir(), "audit-demo-runner-"));
  const state = join(dir, "context");
  const writes = join(dir, "writes");
  const script = `#!/usr/bin/env node
const fs=require('node:fs');
const args=process.argv.slice(2);
const state=process.env.AUDIT_DEMO_FAKE_STATE;
const pin=args[0]==='--host' ? args.splice(0,2)[1] : process.env.DOCKER_HOST;
const target=pin || fs.readFileSync(state,'utf8');
if (args[0]==='context') console.log(JSON.stringify([{Endpoints:{docker:{Host:'unix:///var/run/docker.sock'}}}]));
else if (args[0]==='inspect') console.log(JSON.stringify([{
  Id:(target.startsWith('unix:')?'a':'b').repeat(64),Name:'/supabase_db_gaucha-gestao-local',State:{Running:true},
  Config:{Image:'public.ecr.aws/supabase/postgres:17.6.1.001',Labels:{'com.supabase.cli.project':'gaucha-gestao-local'}}
}]));
else if(args[0]==='exec') {
  fs.readFileSync(0,'utf8');
  fs.writeFileSync(process.env.AUDIT_DEMO_FAKE_WRITES,target);
  console.log(JSON.stringify({result:'criada',user_id:'local-test',user_name:target.startsWith('unix:')?'administrador-local':'administrador-remoto',units:[],plans:[]}));
} else process.exit(1);
`;
  const cli = `#!/usr/bin/env node
const fs=require('node:fs');
// A concurrent operator switches the default context during the CLI call.
fs.writeFileSync(process.env.AUDIT_DEMO_FAKE_STATE,'ssh://remote-daemon');
console.log(JSON.stringify({API_URL:'http://127.0.0.1:54321',DB_URL:'postgres://postgres@127.0.0.1:54322/postgres'}));
`;
  try {
    writeFileSync(state, "unix:///var/run/docker.sock");
    writeFileSync(join(dir, "docker"), script, { mode: 0o755 });
    writeFileSync(join(dir, "npx"), cli, { mode: 0o755 });
    const result = spawnSync(process.execPath, ["scripts/audit-demo/seed.mjs"], {
      cwd: resolve("."), encoding: "utf8",
      env: { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}`, AUDIT_DEMO_FAKE_STATE: state, AUDIT_DEMO_FAKE_WRITES: writes },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(writes, "utf8")).toBe("unix:///var/run/docker.sock");
    expect(result.stdout).toContain("administrador-local");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
