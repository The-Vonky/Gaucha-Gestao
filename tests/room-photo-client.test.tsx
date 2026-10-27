// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  upload: vi.fn(),
  sign: vi.fn(),
}));
vi.mock("../apps/web/src/core/client", () => ({
  client: {
    storage: {
      from: () => ({ upload: mocks.upload, createSignedUrl: mocks.sign }),
    },
  },
}));
vi.mock("../apps/web/src/core/auth/AuthProvider", () => ({
  useAuth: () => ({
    session: { user: { id: "A" } },
    profile: { active: true },
    grants: [],
  }),
}));
vi.mock("../apps/web/src/modules/rooms/api", async (original) => ({
  ...(await original<object>()),
  rpc: mocks.rpc,
}));
import {
  RoomPhoto,
  uploadRoomCover,
} from "../apps/web/src/modules/rooms/RoomPhoto";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ asset_id: "A", object_key: "rooms/A.jpg" });
});
afterEach(cleanup);
it("falha de upload aposenta o pendente e não confirma nem sobrescreve arquivo", async () => {
  mocks.upload.mockResolvedValue({ error: { message: "Falha" } });
  await expect(
    uploadRoomCover(
      { blob: new Blob(["jpeg"]), width: 1, height: 1 },
      4,
      20,
      80,
    ),
  ).rejects.toThrow("Não foi possível enviar");
  expect(mocks.upload.mock.calls[0][2].upsert).toBe(false);
  expect(mocks.rpc).toHaveBeenLastCalledWith("save_cover", {
    p_action: "cancel",
    p_asset: "A",
    p_version: 4,
  });
  expect(mocks.rpc.mock.calls.some((c) => c[1]?.p_action === "confirm")).toBe(
    false,
  );
});
it("confirma com versão/enquadramento esperados e mantém erro de concorrência", async () => {
  mocks.upload.mockResolvedValue({ error: null });
  mocks.rpc.mockImplementation(async (name, args) => {
    if (args?.p_action === "confirm") throw { code: "40001" };
    return { asset_id: "A", object_key: "rooms/A.jpg" };
  });
  await expect(
    uploadRoomCover(
      { blob: new Blob(["jpeg"]), width: 1, height: 1 },
      4,
      20,
      80,
    ),
  ).rejects.toMatchObject({ code: "40001" });
  expect(mocks.rpc).toHaveBeenCalledWith("save_cover", {
    p_action: "confirm",
    p_asset: "A",
    p_version: 4,
    p_x: 20,
    p_y: 80,
  });
});
it("imagem ausente ou assinatura recusada preserva fallback e não oferece edição ao leitor", async () => {
  mocks.rpc.mockResolvedValue({
    version: 1,
    asset_id: "A",
    object_key: "rooms/A.jpg",
    position_x: 50,
    position_y: 50,
  });
  mocks.sign.mockResolvedValue({ error: { message: "Forbidden" } });
  const { container } = render(<RoomPhoto read manager={false} />);
  await waitFor(() => expect(mocks.sign).toHaveBeenCalled());
  expect(container.querySelector("img")).toBeNull();
  expect(screen.queryByText("Alterar foto da sala")).toBeNull();
});
