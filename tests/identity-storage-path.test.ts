import { describe, expect, it } from "vitest";
// @ts-expect-error Contrato JavaScript executado pelo runtime Node standalone.
import { storagePath } from "../apps/core-identity/storage.mjs";

describe("ingresso de objetos da GG-05B", () => {
  it.each([
    ["GET", "/storage/object/authenticated/unit-covers/units/fixture.jpg"],
    ["GET", "/storage/object/abc-source-files/unit/file.xlsx"],
    ["GET", "/storage/render/image/authenticated/audit-checklist-evidence/file.jpg?width=480&format=origin"],
    ["POST", "/storage/object/list/audit-evidence-thumbnails"],
    ["POST", "/storage/object/action-plan-evidence/file.pdf"],
    ["DELETE", "/storage/object/room-covers"],
  ])("permite %s %s no Storage sob o JWT original", (method, url) => {
    expect(storagePath({ method, url })).toBe(url.slice("/storage".length));
  });

  it.each([
    ["GET", "/storage/object/sign/unit-covers/file.jpg?token=fixture"],
    ["GET", "/storage/object/public/unit-covers/file.jpg"],
    ["POST", "/storage/object/sign/unit-covers"],
    ["PUT", "/storage/object/upload/sign/unit-covers/file.jpg?token=fixture"],
    ["GET", "/storage/render/image/sign/unit-covers/file.jpg?token=fixture"],
    ["GET", "/storage/render/image/public/unit-covers/file.jpg"],
    ["POST", "/storage/upload/resumable"],
    ["GET", "/storage/s3/unit-covers/file.jpg"],
    ["GET", "/storage/object/authenticated/unit-covers/%2Ffile.jpg"],
    ["GET", "/storage/object/authenticated/unit-covers/%252Ffile.jpg"],
    ["GET", "/storage/object/authenticated/unit-covers/%2E%2E/file.jpg"],
    ["GET", "/storage/object/unit-covers/file.jpg?token=fixture"],
    ["GET", "/storage/render/image/authenticated/unit-covers/file.jpg?token=fixture"],
    ["GET", "/storage/object/authenticated/unknown-bucket/file.jpg"],
  ])("recusa %s %s antes do Storage", (method, url) => {
    expect(storagePath({ method, url })).toBeNull();
  });
});
