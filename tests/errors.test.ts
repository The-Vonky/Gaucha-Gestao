import { describe, expect, it } from "vitest";
import { message } from "../apps/web/src/shared/errors";

describe("safe client errors", () => {
  it("keeps an empty single-row result ambiguous and provides recovery", () => {
    const text = message({ code: "PGRST116", message: "private database detail" });
    expect(text).toBe("Não foi possível concluir a operação. O registro pode ter sido alterado, estar indisponível ou seu acesso pode ter mudado. Atualize a página e tente novamente.");
    expect(text).not.toContain("Você não tem permissão");
    expect(text).not.toContain("private database detail");
  });
  it("preserves the optimistic-conflict message", () => {
    expect(message({ code: "40001" })).toBe("Este registro foi alterado ou não está mais disponível. Atualize a página e tente novamente.");
  });
  it("only diagnoses permission denial from its explicit error code", () => {
    expect(message({ code: "42501" })).toBe("Você não tem permissão para esta operação. Atualize seu acesso.");
  });
  it("does not expose unrecognized backend errors", () => {
    expect(message(new Error("private database detail"))).toBe("Não foi possível concluir a operação. Verifique sua conexão e tente novamente.");
  });
});
