import { assert, randomUUID, pg, config, A, BUCKET, blob, db, users, service, bucket, must, fails, rpc, beginArgs, begin, upload, confirm, remove, attach, list, row, evidenceRow, inspection, fill, finalize, reopen, expire, report, countEvents, download, waitForLock, session, outcome, race, beginSql, confirmSql, removeSql, finalizeSql, state } from "./audit-evidence-fixture.mjs";

export async function runDatabase() {
  state.phase = "quotas";
  // Quotas count available and live pending; removed/expired attempts free their slots.
  const limited = await inspection();
  const active = await attach("owner", limited);
  for (let n = 0; n < 9; n++) await begin("owner", limited);
  fails(await rpc("owner", "begin_checklist_evidence_upload", beginArgs(limited)), "23514");
  must(await remove("owner", active.evidence_id));
  const freed = await begin("owner", limited);
  await expire(freed.evidence_id);
  await begin("owner", limited);
  const total = await inspection();
  const keys = (await db.query("select item_key from audit.inspection_answers where inspection_id=$1 order by item_key", [total])).rows;
  for (let n = 0; n < 100; n++) await begin("owner", total, keys[Math.floor(n / 10)].item_key);
  fails(await rpc("owner", "begin_checklist_evidence_upload", beginArgs(total, keys[10].item_key)), "23514");
  const concurrentCriterion = await inspection();
  for (let n = 0; n < 9; n++) await begin("owner", concurrentCriterion);
  let results = await race("owner", beginSql(concurrentCriterion), "unit", beginSql(concurrentCriterion));
  assert.deepEqual(results, [{ allowed: true }, { allowed: false, code: "23514" }]);
  const concurrentTotal = await inspection();
  for (let n = 0; n < 99; n++) await begin("owner", concurrentTotal, keys[Math.floor(n / 10)].item_key);
  results = await race("owner", beginSql(concurrentTotal, keys[10].item_key), "unit", beginSql(concurrentTotal, keys[11].item_key));
  assert.deepEqual(results, [{ allowed: true }, { allowed: false, code: "23514" }]);
  console.log("PASS 10/criterion and 100/inspection quotas include live pending/available, exclude removed/expired; real two-session begins claim only the last slot");

  state.phase = "PostgreSQL concurrency";
  // Two real transactions prove evidence-set binding in both commit orders.
  for (const mutation of ["confirm", "remove"]) {
    const id = await inspection();
    await fill(id);
    const evidence = mutation === "confirm" ? await begin("owner", id) : await attach("owner", id);
    if (mutation === "confirm") must(await upload("owner", evidence.object_key));
    const expected = mutation === "confirm" ? [] : [evidence];
    results = await race("global", await finalizeSql(id, expected), "owner",
      mutation === "confirm" ? confirmSql(evidence.evidence_id) : removeSql(evidence.evidence_id));
    assert.deepEqual(results, [{ allowed: true }, { allowed: false, code: "55000" }]);
    assert.equal((await evidenceRow(evidence.evidence_id)).status, mutation === "confirm" ? "pending" : "available");
    const reverse = await inspection();
    await fill(reverse);
    const second = mutation === "confirm" ? await begin("owner", reverse) : await attach("owner", reverse);
    if (mutation === "confirm") must(await upload("owner", second.object_key));
    results = await race("owner", mutation === "confirm" ? confirmSql(second.evidence_id) : removeSql(second.evidence_id),
      "global", await finalizeSql(reverse, mutation === "confirm" ? [] : [second]));
    assert.deepEqual(results, [{ allowed: true }, { allowed: false, code: "40001" }]);
    assert.equal((await row(reverse)).status, "draft", "Mismatch never finalizes");
    must(await finalize("global", reverse, mutation === "confirm" ? [second] : []));
  }
  const removeTwice = await attach("owner", await inspection());
  results = await race("owner", removeSql(removeTwice.evidence_id), "unit", removeSql(removeTwice.evidence_id));
  assert.deepEqual(results, [{ allowed: true }, { allowed: true }]);
  assert.equal(await countEvents(removeTwice.evidence_id, "evidence_remove"), 1);
  const confirmTwice = await begin("owner", await inspection());
  must(await upload("owner", confirmTwice.object_key));
  results = await race("owner", confirmSql(confirmTwice.evidence_id), "owner", confirmSql(confirmTwice.evidence_id));
  assert.deepEqual(results, [{ allowed: true }, { allowed: true }]);
  assert.equal(await countEvents(confirmTwice.evidence_id, "evidence_add"), 1);
  const parallel = await inspection();
  const distinct = await Promise.all([attach("owner", parallel, "item-001", "one.pdf"), attach("unit", parallel, "item-001", "two.pdf")]);
  assert.notEqual(distinct[0].object_key, distinct[1].object_key);
  assert.deepEqual((await list("reader", parallel)).map((e) => e.id).sort(), distinct.map((e) => e.evidence_id).sort());

  // Revocation while waiting on the parent lock applies to begin/confirm/remove.
  for (const operation of ["begin", "confirm", "remove"]) {
    await db.query("update core.user_role_assignments set active=true where user_id=$1", [users.revoked]);
    const id = await inspection();
    const e = operation === "begin" ? null : operation === "confirm" ? await begin("revoked", id) : await attach("revoked", id);
    if (operation === "confirm") must(await upload("revoked", e.object_key));
    const locker = new pg.Client({ connectionString: config.DB_URL });
    await locker.connect();
    const caller = await session("audit-evidence-revoked", "revoked");
    try {
      await locker.query("begin");
      await locker.query("select id from audit.inspections where id=$1 for update", [id]);
      const waiting = outcome(caller.query(...(operation === "begin" ? beginSql(id) : operation === "confirm" ? confirmSql(e.evidence_id) : removeSql(e.evidence_id))));
      await waitForLock("audit-evidence-revoked");
      await locker.query("update core.user_role_assignments set active=false where user_id=$1", [users.revoked]);
      await locker.query("commit");
      assert.deepEqual(await waiting, { allowed: false, code: "42501" });
      if (e) assert.equal((await evidenceRow(e.evidence_id)).status, operation === "confirm" ? "pending" : "available");
    } finally {
      await locker.query("rollback").catch(() => {});
      await locker.end();
      await caller.end();
    }
  }
  // Expiry is evaluated after the wait, rather than at transaction start.
  const expiresWaiting = await begin("owner", await inspection());
  must(await upload("owner", expiresWaiting.object_key));
  await expire(expiresWaiting.evidence_id, "59 minutes 58 seconds");
  const expiryLocker = new pg.Client({ connectionString: config.DB_URL });
  await expiryLocker.connect();
  const expiryCaller = await session("audit-evidence-expiry", "owner");
  try {
    await expiryLocker.query("begin");
    await expiryLocker.query("select id from audit.inspections where id=$1 for update", [(await evidenceRow(expiresWaiting.evidence_id)).inspection_id]);
    const waiting = outcome(expiryCaller.query(...confirmSql(expiresWaiting.evidence_id)));
    await waitForLock("audit-evidence-expiry");
    await new Promise((done) => setTimeout(done, 2200));
    await expiryLocker.query("commit");
    assert.deepEqual(await waiting, { allowed: false, code: "55000" });
  } finally {
    await expiryLocker.query("rollback").catch(() => {});
    await expiryLocker.end();
    await expiryCaller.end();
  }
  console.log("PASS PostgreSQL finalize/confirm and finalize/remove both orders, atomic 40001 basis conflicts, one event for concurrent repeats, distinct simultaneous keys, revocation and expiry after waits");

  state.phase = "lifecycle binding";
  // Full inspection set includes criteria outside the current UI section.
  const lifecycle = await inspection();
  await fill(lifecycle);
  const retained = await attach("owner", lifecycle);
  const hiddenSection = await attach("owner", lifecycle, "item-128", "outra seção.pdf");
  const removed = await attach("owner", lifecycle, "item-002");
  must(await remove("owner", removed.evidence_id));
  const oldPending = await begin("owner", lifecycle, "item-003");
  must(await upload("owner", oldPending.object_key));
  fails(await rpc("global", "finalize_inspection", { p_id: lifecycle, p_version: (await row(lifecycle)).version }));
  fails(await rpc("global", "finalize_inspection", { p_id: lifecycle, p_version: (await row(lifecycle)).version, p_expected_evidence_ids: null }), "23514");
  fails(await finalize("global", lifecycle, [retained]), "40001");
  must(await finalize("global", lifecycle, [hiddenSection, retained]));
  for (const [operation, id] of [["confirm", retained.evidence_id], ["confirm", oldPending.evidence_id],
    ["remove", retained.evidence_id], ["remove", removed.evidence_id]])
    fails(await (operation === "confirm" ? confirm("owner", id) : remove("owner", id)), "55000", "Finalized rejects even idempotent mutation");
  fails(await rpc("owner", "begin_checklist_evidence_upload", beginArgs(lifecycle)), "55000");
  await download("reader", retained.object_key, "laudo.pdf");
  const firstSnapshot = (await db.query(
    "select metadata->'evidence_ids' ids from core.system_audit_log where module='audit' and entity_id=$1 and action='finalize' order by occurred_at",
    [lifecycle],
  )).rows[0].ids;
  assert.deepEqual(firstSnapshot.sort(), [retained.evidence_id, hiddenSection.evidence_id].sort());
  must(await reopen(lifecycle));
  fails(await confirm("owner", oldPending.evidence_id), "55000", "Finalize/reopen cannot revive pending upload");
  const unuploadedOld = await begin("owner", lifecycle, "item-004");
  must(await finalize("global", lifecycle, [retained, hiddenSection]));
  must(await reopen(lifecycle));
  fails(await upload("owner", unuploadedOld.object_key), null, "Old pending cannot upload after lifecycle changed");
  assert.deepEqual((await list("reader", lifecycle)).map((e) => e.id).sort(), [retained.evidence_id, hiddenSection.evidence_id].sort());
  assert.equal((await evidenceRow(removed.evidence_id)).status, "removed");
  fails(await remove("reader", retained.evidence_id), "42501", "Reopen does not grant edit");
  must(await remove("owner", retained.evidence_id));
  const replacement = await attach("owner", lifecycle, "item-001", "nova.pdf");
  must(await finalize("global", lifecycle, [replacement, hiddenSection]));
  const snapshots = (await db.query(
    "select metadata->'evidence_ids' ids from core.system_audit_log where module='audit' and entity_id=$1 and action='finalize' order by occurred_at",
    [lifecycle],
  )).rows;
  assert.equal(snapshots.length, 3);
  assert.deepEqual(snapshots[0].ids.sort(), firstSnapshot.sort());
  assert.deepEqual(snapshots[2].ids.sort(), [replacement.evidence_id, hiddenSection.evidence_id].sort());
  console.log("PASS finalization requires the entire available set, rejects old/null signature and all finalized retries; reopen retains available/removed history, invalidates pending and freezes each new set");

  state.phase = "reconciliation and restore";
  // Reconciliation and isolated restore fixture: original object copies and actual downloads.
  const recovery = await inspection();
  const missingPending = await begin("owner", recovery);
  const presentPending = await begin("owner", recovery, "item-002");
  must(await upload("owner", presentPending.object_key));
  const lost = await attach("owner", recovery, "item-003");
  const orphan = recovery + "/" + randomUUID();
  must(await service.storage.from(BUCKET).upload(orphan, blob(), { cacheControl: "0" }));
  // Copy at T before authorized fixture deletion; bytes are retained independently in memory.
  const copy = Buffer.from(await must(await bucket("reader").download(lost.object_key)).arrayBuffer());
  assert.ok(copy.equals(bytes));
  must(await service.storage.from(BUCKET).remove([lost.object_key]));
  fails(await bucket("reader").createSignedUrl(lost.object_key, 60));
  await expire(missingPending.evidence_id);
  await expire(presentPending.evidence_id);
  const issues = (await report(recovery)).map((r) => [r.issue, r.evidence_id ?? r.object_key, r.detail]);
  assert.deepEqual(issues.sort(), [
    ["expired_pending", missingPending.evidence_id, "no object"],
    ["expired_pending", presentPending.evidence_id, "object present"],
    ["available_missing_object", lost.evidence_id, null],
    ["orphan_object", orphan, null],
  ].sort());
  must(await service.storage.from(BUCKET).upload(lost.object_key, blob(copy), { cacheControl: "0" }), "Restore physical bytes using Storage API");
  await download("reader", lost.object_key, "laudo.pdf", copy);
  fails(await bucket("other").createSignedUrl(lost.object_key, 60));
  fails(await bucket("other").download(lost.object_key));
  assert.ok(!(await report(recovery)).some((issue) => issue.issue === "available_missing_object"));
  // Authorized local operator fixture purge, audited separately from logical removal.
  must(await service.storage.from(BUCKET).remove([orphan]));
  await db.query(
    "insert into core.system_audit_log(actor_user_id,module,entity_type,entity_id,action,unit_id,metadata) values($1,'audit','checklist_evidence',$2,'evidence_purge',$3,$4::jsonb)",
    [users.global, randomUUID(), A, JSON.stringify({ inspection_id: recovery, fixture: true, authorization: "disposable integration fixture" })],
  );
  assert.ok(!(await report(recovery)).some((issue) => issue.issue === "orphan_object"));
  console.log("PASS reconciliation: expired pending with/without object, missing available object and orphan; fixture backup/Storage API restore preserves real bytes and cross-unit denial; audited operator fixture purge");

}
