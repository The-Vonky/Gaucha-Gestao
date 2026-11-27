import { describe, expect, it } from "vitest";
// @ts-expect-error Contrato JavaScript executado pelo runtime Node standalone.
import { storagePath } from "../apps/core-identity/storage.mjs";

const report = "a3508ff6-68c5-4de0-a925-cdb556ac016a";

describe("ingresso de objetos da GG-05B", () => {
  it.each([
    ["GET", "/storage/object/authenticated/unit-covers/units/fixture.jpg"],
    ["GET", "/storage/object/abc-source-files/unit/file.xlsx"],
    ["GET", "/storage/render/image/authenticated/audit-checklist-evidence/file.jpg?width=480&format=origin"],
    ["POST", "/storage/object/audit-checklist-evidence/file.jpg"],
    ["GET", "/storage/render/image/authenticated/audit-evidence-thumbnails/file.jpg"],
    ["POST", "/storage/object/list/audit-evidence-thumbnails"],
    ["POST", "/storage/object/action-plan-evidence/file.pdf"],
    ["GET", "/storage/render/image/authenticated/action-plan-evidence/file.jpg?width=480&height=480&resize=contain&quality=75&format=origin"],
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
    ["POST", "/storage/object/sign/action-plan-evidence/file.jpg"],
    ["GET", "/storage/render/image/sign/audit-checklist-evidence/file.jpg?token=fixture"],
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

describe("ingresso de anexos da GG-11", () => {
  it.each(["png", "jpg"])("aceita upload simples e download de %s pelo SDK", (ext) => {
    const key = `/object/feedback-attachments/${report}.${ext}`;
    const url = `/storage${key}`;
    expect(storagePath({ method: "POST", url, headers: { "x-upsert": "false" } })).toBe(key);
    expect(storagePath({ method: "GET", url })).toBe(key);
    expect(storagePath({ method: "POST", url, headers: { "x-upsert": "true" } })).toBeNull();
  });

  it.each([
    ["HEAD", `object/feedback-attachments/${report}.png`],
    ["PUT", `object/feedback-attachments/${report}.png`],
    ["DELETE", `object/feedback-attachments/${report}.png`],
    ["DELETE", "object/feedback-attachments"],
    ["POST", "object/list/feedback-attachments"],
    ["GET", `object/info/feedback-attachments/${report}.png`],
    ["GET", `object/authenticated/feedback-attachments/${report}.png`],
    ["GET", `object/public/feedback-attachments/${report}.png`],
    ["POST", `object/sign/feedback-attachments/${report}.png`],
    ["GET", `object/sign/feedback-attachments/${report}.png?token=fixture`],
    ["GET", `render/image/authenticated/feedback-attachments/${report}.png?width=10`],
    ["GET", `object/feedback-attachments/${report}.png?`],
    ["POST", `object/feedback-attachments/other/${report}.png`],
    ["POST", `object/feedback-attachments/${report}.jpeg`],
    ["POST", `object/feedback-attachments/${report.toUpperCase()}.png`],
    ["POST", `object/feedback-attachments/${report}%2Epng`],
    ["POST", "object/feedback-attachments/not-a-uuid.png"],
  ])("nega %s %s no ingresso", (method, path) => {
    expect(storagePath({ method, url: `/storage/${path}` })).toBeNull();
  });
});
