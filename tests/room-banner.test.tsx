// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RoomHeroBanner } from "../apps/web/src/modules/rooms/RoomHeroBanner";
const base = {
  name: "Sala",
  server_now: "2026-10-26T15:00:00Z",
  in_use: true,
  in_use_until: "2026-10-26T15:00:03Z",
  today_count: 2,
  next_start: "2026-10-26T15:00:03Z",
};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("conta pelo relógio do servidor, termina sem negativos e reconsulta uma única vez", () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
  const refresh = vi.fn();
  const view = render(
    <RoomHeroBanner
      summary={base}
      loading={false}
      manager={false}
      onBoundary={refresh}
    />,
  );
  expect(screen.getByRole("timer").textContent).toBe("Termina em 00:00:03");
  expect(screen.getAllByText("Em uso")[0].className).toContain("is-busy");
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByRole("timer").textContent).toBe("Termina em 00:00:01");
  act(() => vi.advanceTimersByTime(4000));
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("timer")).toBeNull();
  // Reserva imediatamente seguinte: novo resumo continua ocupado.
  view.rerender(
    <RoomHeroBanner
      summary={{
        ...base,
        server_now: "2026-10-26T15:00:03Z",
        in_use_until: "2026-10-26T15:01:03Z",
      }}
      loading={false}
      manager={false}
      onBoundary={refresh}
    />,
  );
  expect(screen.getByRole("timer").textContent).toBe("Termina em 00:01:00");
  view.rerender(
    <RoomHeroBanner
      summary={{ ...base, in_use: false, in_use_until: null, next_start: null }}
      loading={false}
      manager={false}
      onBoundary={refresh}
    />,
  );
  expect(screen.getAllByText("Disponível agora")[0].className).toContain(
    "is-free",
  );
});
it("retorno da aba usa tempo transcorrido mesmo sem ticks e dispara transição de próxima reunião", () => {
  let monotonic = 0;
  vi.spyOn(performance, "now").mockImplementation(() => monotonic);
  const refresh = vi.fn();
  render(
    <RoomHeroBanner
      summary={{ ...base, in_use: false }}
      loading={false}
      manager={false}
      onBoundary={refresh}
    />,
  );
  monotonic = 6000;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(refresh).toHaveBeenCalledTimes(1);
});
it("desconta o tempo desde o recebimento mesmo quando outras consultas atrasam a renderização", () => {
  vi.spyOn(performance, "now").mockReturnValue(2000);
  render(
    <RoomHeroBanner
      summary={{ ...base, receivedAt: 0 }}
      loading={false}
      manager={false}
    />,
  );
  expect(screen.getByRole("timer").textContent).toBe("Termina em 00:00:01");
});
