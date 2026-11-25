import { expect, it } from "vitest";
import { assertFixtureCoverHistory } from "./integration/room-booking-browser-fixtures.mjs";

const initial = { room_id: "sala", asset_id: null, position_x: 50, position_y: 50, version: 1 };
const confirmed = { ...initial, asset_id: "foto-fixture", version: 2 };
const framed = { ...confirmed, position_x: 70, position_y: 30, version: 3 };
const removed = { ...initial, version: 4 };
const manager = "gestora-fixture";
const assets = [confirmed.asset_id];
const event = (before: typeof initial | typeof confirmed, after: typeof initial | typeof confirmed, actor = manager) => ({
  actor_user_id: actor,
  before_data: before,
  after_data: after,
});
const ownEvents = [event(initial, confirmed), event(confirmed, framed), event(framed, removed)];

it("aceita a configuração da própria fixture após remover a foto ou interromper o ensaio", () => {
  expect(() => assertFixtureCoverHistory(initial, removed, ownEvents, manager, assets)).not.toThrow();
  expect(() => assertFixtureCoverHistory(initial, confirmed, ownEvents.slice(0, 1), manager, assets)).not.toThrow();
  expect(() => assertFixtureCoverHistory(initial, initial, [], manager, [])).not.toThrow();
});

it("recusa a restauração após remoção por outro operador, mesmo com o ponteiro nulo", () => {
  const concurrent = [...ownEvents.slice(0, 2), event(framed, removed, "outra-gestora")];
  expect(() => assertFixtureCoverHistory(initial, removed, concurrent, manager, assets)).toThrow(/Divergência na auditoria/);
});

it("recusa enquadramento que diverge da trilha e ativos fora da fixture", () => {
  expect(() => assertFixtureCoverHistory(initial, { ...framed, position_x: 10 }, ownEvents.slice(0, 2), manager, assets))
    .toThrow(/Divergência na configuração/);
  const foreign = { ...confirmed, asset_id: "foto-externa" };
  expect(() => assertFixtureCoverHistory(initial, foreign, [event(initial, foreign)], manager, assets))
    .toThrow(/Divergência na auditoria/);
});
