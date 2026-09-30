import { assert, randomUUID, config, A, B, BUCKET, PDF, bytes, blob, db, users, clients, service, api, bucket, must, fails, rpc, beginArgs, begin, upload, confirm, remove, list, row, evidenceRow, inspection, expire, countEvents, download, state } from "./audit-evidence-fixture.mjs";

export async function runApi() {
  state.phase = "real bytes flow";
  const main = await inspection();
  const initialVersion = (await row(main)).version;
  const first = await begin("owner", main, "item-001", "Relatório vistoria.pdf");
  assert.equal(first.object_key, main + "/" + first.evidence_id);
  must(await upload("owner", first.object_key), "Real upload");
  const stored = (await db.query("select owner_id,metadata from storage.objects where bucket_id=$1 and name=$2",
    [BUCKET, first.object_key])).rows[0];
  assert.equal(stored.owner_id, users.owner);
  assert.equal(stored.metadata.size, bytes.length);
  assert.equal(stored.metadata.mimetype, PDF);
  assert.equal(stored.metadata.cacheControl, "max-age=0");
  assert.deepEqual(await list("owner", main), []);
  fails(await bucket("owner").createSignedUrl(first.object_key, 60));
  must(await confirm("owner", first.evidence_id));
  must(await confirm("owner", first.evidence_id));
  assert.equal(await countEvents(first.evidence_id, "evidence_add"), 1);
  assert.equal((await row(main)).version, initialVersion, "Evidence leaves answer/inspection versions unchanged");
  for (const user of ["global", "unit", "reader", "owner"]) {
    const [visible] = await list(user, main);
    assert.equal(visible.id, first.evidence_id);
    assert.equal(visible.original_name, "Relatório vistoria.pdf");
    assert.ok(visible.uploaded_by_name?.length > 0, "Uploader name without admin.user.read");
    assert.equal(must(await api(user).from("checklist_evidence").select("id").eq("id", first.evidence_id)).length, 1);
    await download(user, first.object_key, visible.original_name);
  }
  const headers = await download("unit", first.object_key, "Relatório vistoria.pdf");
  console.log("OBSERVED local Storage headers: cache-control=" + (headers.get("cache-control") ?? "(absent)") +
    "; x-content-type-options=" + (headers.get("x-content-type-options") ?? "(absent)"));
  const event = (await db.query(
    "select action,actor_user_id,unit_id,before_data,after_data,metadata from core.system_audit_log where entity_type='checklist_evidence' and entity_id=$1",
    [first.evidence_id],
  )).rows[0];
  assert.equal(event.action, "evidence_add");
  assert.equal(event.actor_user_id, users.owner);
  assert.equal(event.unit_id, A);
  assert.equal(event.before_data, null);
  assert.equal(event.metadata.inspection_id, main);
  assert.equal(event.metadata.item_key, "item-001");
  for (const forbidden of ["object_key", "signedUrl", "token", "password", "base64"])
    assert.ok(!JSON.stringify(event).includes(forbidden), "Safe audit payload excludes " + forbidden);
  console.log("PASS Auth/JWT/PostgREST/Storage begin/upload/confirm/list/60s attachment download, bytes, owner, metadata, idempotency, scoped uploader name and safe audit");

  state.phase = "authorization and bypasses";
  // Default deny, permission separation, unknown IDs and server-generated keys.
  for (const user of ["anon", "inactive", "empty", "other", "sector", "reader"]) {
    fails(await rpc(user, "begin_checklist_evidence_upload", beginArgs(main)));
    fails(await confirm(user, first.evidence_id));
    fails(await remove(user, first.evidence_id));
  }
  for (const user of ["inactive", "empty", "other", "sector", "editOnly"]) {
    assert.deepEqual(await list(user, main), []);
    assert.deepEqual(must(await api(user).from("checklist_evidence").select("id").eq("id", first.evidence_id)), []);
    fails(await bucket(user).createSignedUrl(first.object_key, 60));
    fails(await bucket(user).download(first.object_key));
  }
  fails(await api("anon").from("checklist_evidence").select("id"));
  fails(await rpc("anon", "checklist_evidence", { p_inspection: main }));
  await assert.rejects(db.query(
    "insert into audit.checklist_evidence(inspection_id,item_key,original_name,content_type,size_bytes,inspection_version_at_begin,created_by) values($1,'item-999','x.pdf',$2,1,1,$3)",
    [main, PDF, users.owner],
  ), (error) => error.code === "23503", "Composite FK rejects a criterion outside the inspection");
  await assert.rejects(db.query(
    "update audit.checklist_evidence set original_name='changed.pdf' where id=$1", [first.evidence_id],
  ), (error) => error.code === "55000", "Persisted evidence metadata is immutable");
  const unknown = randomUUID();
  assert.equal((await confirm("other", first.evidence_id)).error.code, (await confirm("other", unknown)).error.code);
  assert.equal((await remove("other", first.evidence_id)).error.code, (await remove("other", unknown)).error.code);
  const pending = await begin("owner", main, "item-002");
  for (const user of ["unit", "other", "sector", "inactive", "empty", "anon"])
    fails(await upload(user, pending.object_key), null, "Only uploader may insert pending object");
  fails(await upload("owner", main + "/" + randomUUID()));
  fails(await clients.owner.storage.from("action-plan-evidence").upload(pending.object_key, blob()));
  // A readable source copied/moved into a valid own pending destination must still be denied.
  fails(await bucket("owner").upload(pending.object_key, blob(), { upsert: true }), null, "Upsert is denied even for a valid pending key");
  fails(await bucket("owner").copy(first.object_key, pending.object_key), null, "Storage copy cannot populate pending");
  fails(await bucket("owner").move(first.object_key, pending.object_key), null, "Storage move cannot populate pending");
  assert.equal((await db.query("select count(*)::int n from storage.objects where bucket_id=$1 and name=$2",
    [BUCKET, pending.object_key])).rows[0].n, 0, "Bypass destination remains absent");
  fails(await confirm("unit", pending.evidence_id), "42501", "Confirm requires original uploader");
  fails(await remove("owner", pending.evidence_id), "42501", "Pending is not removable business evidence");
  fails(await confirm("owner", pending.evidence_id), "23514", "Missing object cannot confirm");
  for (const method of ["insert", "update", "delete"]) {
    const relation = api("owner").from("checklist_evidence");
    const result = method === "insert" ? await relation.insert({
      inspection_id: main, item_key: "item-001", original_name: "forged.pdf", content_type: PDF,
      size_bytes: 1, inspection_version_at_begin: 1, created_by: users.global,
    }) : method === "update" ? await relation.update({ status: "available", created_by: users.global }).eq("id", pending.evidence_id)
      : await relation.delete().eq("id", pending.evidence_id);
    fails(result, null, "Client table " + method + " has no grant");
  }
  for (const attempt of [
    () => bucket("owner").upload(first.object_key, blob(), { upsert: true }),
    () => bucket("owner").update(first.object_key, blob()),
    () => bucket("owner").move(first.object_key, main + "/" + randomUUID()),
    () => bucket("owner").copy(first.object_key, main + "/" + randomUUID()),
  ]) fails(await attempt());
  must(await bucket("owner").remove([first.object_key]));
  assert.equal((await db.query("select count(*)::int n from storage.objects where bucket_id=$1 and name=$2",
    [BUCKET, first.object_key])).rows[0].n, 1, "Client physical delete did not remove the object");
  assert.notEqual((await fetch(config.API_URL + "/storage/v1/object/public/" + BUCKET + "/" + first.object_key)).status, 200);
  const editPending = await begin("editOnly", main, "item-003");
  must(await upload("editOnly", editPending.object_key));
  must(await confirm("editOnly", editPending.evidence_id));
  assert.deepEqual(await list("editOnly", main), [], "Edit does not grant read");
  must(await remove("unit", editPending.evidence_id), "Editor need not own removal");
  must(await remove("unit", editPending.evidence_id));
  assert.equal(await countEvents(editPending.evidence_id, "evidence_remove"), 1);
  fails(await bucket("unit").createSignedUrl(editPending.object_key, 60));
  assert.equal((await evidenceRow(editPending.evidence_id)).status, "removed");
  assert.ok(Buffer.from(await must(await service.storage.from(BUCKET).download(editPending.object_key)).arrayBuffer()).equals(bytes), "Logical removal retains physical original bytes");
  const foreign = await inspection(B);
  fails(await rpc("unit", "begin_checklist_evidence_upload", beginArgs(foreign)), "42501");
  fails(await rpc("owner", "begin_checklist_evidence_upload", beginArgs(main, "item-999")), "42501");
  console.log("PASS anon/inactive/no-grant/global/unit/wrong-unit/sector/uploader matrix; read/edit separation; table, guessed-key, foreign-bucket, overwrite/upsert/move/copy/delete bypass denial");

  state.phase = "file validation";
  // Server filename, MIME, size boundaries; bucket and confirmation metadata checks.
  const rules = await inspection();
  for (const [name, type, size] of [
    ["x.pdf", PDF, 0], ["x.pdf", PDF, -1], ["x.pdf", PDF, 10485761], ["x.pdf", PDF, null],
    ["x.pdf", "image/jpeg", 1], ["x.svg", "image/svg+xml", 1], ["x.html", "text/html", 1],
    ["x.heic", "image/heic", 1], ["x.doc", "application/msword", 1], ["x.xlsm", PDF, 1],
    ["../x.pdf", PDF, 1], ["a\\x.pdf", PDF, 1], [".x.pdf", PDF, 1], ["x.pdf ", PDF, 1],
    ["x.pdf.", PDF, 1], ["a:b.pdf", PDF, 1], ["x\u202e.pdf", PDF, 1], ["a\n.pdf", PDF, 1],
    ["", PDF, 1], ["e\u0301.pdf", PDF, 1], ["a".repeat(177) + ".pdf", PDF, 1],
  ]) fails(await rpc("owner", "begin_checklist_evidence_upload", beginArgs(rules, "item-001", name, type, size)), "23514");
  for (const [name, type, size] of [
    ["É.pdf", PDF, 1], ["a".repeat(176) + ".pdf", PDF, 10485760],
    ["x.JPG", "image/jpeg", 1], ["x.jpeg", "image/jpeg", 1], ["x.png", "image/png", 1],
    ["x.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 1],
    ["x.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 1],
  ]) await begin("owner", rules, "item-001", name, type, size);
  const direct = await begin("owner", rules, "item-002");
  for (const body of [
    blob(Buffer.from("<html/>"), "text/html"), blob(Buffer.from("<svg/>"), "image/svg+xml"),
    blob(Buffer.from("MZ"), "application/x-msdownload"), blob(Buffer.alloc(10485761)),
  ]) fails(await upload("owner", direct.object_key, body), null, "Bucket MIME/size enforcement");
  const wrongSize = await begin("owner", rules, "item-003", "x.pdf", PDF, bytes.length + 1);
  must(await upload("owner", wrongSize.object_key));
  fails(await confirm("owner", wrongSize.evidence_id), "23514");
  const wrongMime = await begin("owner", rules, "item-003");
  must(await upload("owner", wrongMime.object_key, blob(bytes, "image/png")));
  fails(await confirm("owner", wrongMime.evidence_id), "23514");
  const wrongOwner = await begin("owner", rules, "item-003");
  must(await service.storage.from(BUCKET).upload(wrongOwner.object_key, blob(), { cacheControl: "0" }));
  fails(await confirm("owner", wrongOwner.evidence_id), "23514");
  const expired = await begin("owner", rules, "item-004");
  must(await upload("owner", expired.object_key));
  await expire(expired.evidence_id);
  fails(await confirm("owner", expired.evidence_id), "55000");
  fails(await upload("owner", expired.object_key));
  fails(await bucket("owner").createSignedUrl(expired.object_key, 60));
  const expiredEmpty = await begin("owner", rules, "item-005");
  await expire(expiredEmpty.evidence_id);
  fails(await upload("owner", expiredEmpty.object_key), null, "Expired pending cannot insert new bytes");
  console.log("PASS NFC filename/length/punctuation/bidi/extension rules, 1..10MiB and MIME allowlist, bucket limits, exact uploaded size/MIME/owner, expired pending");

}
