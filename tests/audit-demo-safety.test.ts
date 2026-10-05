import { describe, expect, it } from "vitest";
import {
  assertLocalEnvironment,
  assertLocalStatus,
  assertDockerEndpoint,
  assertLocalContainer,
  parseArguments,
} from "../scripts/audit-demo/local.mjs";

const status = { API_URL: "http://127.0.0.1:54321", DB_URL: "postgresql://postgres:local@127.0.0.1:54322/postgres" };
const container = {
  Id: "a".repeat(64), Name: "/supabase_db_gaucha-gestao-local",
  State: { Running: true },
  Config: { Image: "public.ecr.aws/supabase/postgres:17.6.1.001", Labels: { "com.supabase.cli.project": "gaucha-gestao-local" } },
};
describe("audit demo target boundary", () => {
  it("accepts only canonical loopback endpoints on the project ports", () => {
    expect(() => assertLocalStatus(status)).not.toThrow();
    expect(() => assertLocalStatus({ API_URL: "http://localhost:54321", DB_URL: "postgres://postgres@localhost:54322/postgres" })).not.toThrow();
    for (const host of ["project.supabase.co", "localhost.evil.test", "[::1]", "0.0.0.0", "127.1", "2130706433", "127.0.0.2"]) {
      expect(() => assertLocalStatus({ ...status, API_URL: `http://${host}:54321` })).toThrow();
      expect(() => assertLocalStatus({ ...status, DB_URL: `postgresql://postgres@${host}:54322/postgres` })).toThrow();
    }
  });
  it("rejects credentials, paths, transport overrides and unknown ports", () => {
    for (const url of ["https://127.0.0.1:54321", "http://127.0.0.1:8000", "http://user:pass@localhost:54321", "http://localhost:54321/remote", "http://localhost:54321?target=remote"])
      expect(() => assertLocalStatus({ ...status, API_URL: url })).toThrow();
    for (const url of ["postgres://postgres@localhost:6543/postgres", "postgres://postgres@localhost:54322/production", "postgres://postgres@localhost:54322/postgres?host=remote.test", "postgres://postgres@localhost:54322/postgres#remote"])
      expect(() => assertLocalStatus({ ...status, DB_URL: url })).toThrow();
    expect(() => assertLocalStatus({ API_URL: status.API_URL })).toThrow();
  });
  it("rejects production, linked state, remote variables and supplied secrets", () => {
    expect(() => assertLocalEnvironment({}, false)).not.toThrow();
    expect(() => assertLocalEnvironment({}, true)).toThrow(/linked/i);
    for (const env of [
      { NODE_ENV: "production" }, { APP_ENV: "prod" }, { ENVIRONMENT: "staging" },
      { SUPABASE_PROJECT_REF: "linked" }, { SUPABASE_ACCESS_TOKEN: "secret" },
      { SUPABASE_SERVICE_ROLE_KEY: "secret" }, { PGPASSWORD: "secret" },
      { SUPABASE_URL: "https://remote.supabase.co" }, { VITE_SUPABASE_URL: "https://remote.supabase.co" },
      { DATABASE_URL: "postgres://postgres@remote.test/postgres" },
      { DOCKER_HOST: "tcp://127.0.0.1:2375" }, { DOCKER_CONTEXT: "production" },
      { PGHOST: "127.0.0.1" }, { SUPABASE_DB_URL: "postgres://postgres@localhost:54322/postgres?host=remote.test" },
    ]) expect(() => assertLocalEnvironment(env, false)).toThrow();
  });
  it("rejects network Docker contexts and non CLI or stopped containers", () => {
    for (const endpoint of ["unix:///var/run/docker.sock", "npipe:////./pipe/docker_engine"])
      expect(() => assertDockerEndpoint(endpoint)).not.toThrow();
    for (const endpoint of ["ssh://remote", "tcp://localhost:2375", "https://remote", ""])
      expect(() => assertDockerEndpoint(endpoint)).toThrow();
    expect(assertLocalContainer(container)).toBe(container.Id);
    for (const changed of [
      { ...container, Name: "/production" }, { ...container, State: { Running: false } },
      { ...container, Config: { ...container.Config, Labels: {} } },
      { ...container, Config: { ...container.Config, Image: "postgres:17" } },
      { ...container, Id: "invalid" },
    ]) expect(() => assertLocalContainer(changed)).toThrow();
  });
  it("has no remote target flags and validates the optional actor UUID", () => {
    expect(parseArguments([])).toEqual({ userId: "" });
    expect(parseArguments(["--user-id", "00000000-0000-4000-8000-000000000001"])).toEqual({ userId: "00000000-0000-4000-8000-000000000001" });
    for (const args of [["--linked"], ["--db-url", "postgres://remote"], ["--user-id"], ["--user-id", "';drop schema core;--"], ["--user-id", "0".repeat(36)], ["--user-id", "00000000-0000-4000-8000-000000000001", "--user-id", "00000000-0000-4000-8000-000000000001"]])
      expect(() => parseArguments(args)).toThrow();
  });
});
