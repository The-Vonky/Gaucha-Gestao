// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Login } from "../apps/web/src/core/auth/Login";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Login v3", () => {
  it("shows and hides the password without changing the field accessible name", () => {
    render(<Login />);

    const password = screen.getByLabelText(/^Senha$/i) as HTMLInputElement;
    expect(password.type).toBe("password");
    expect(password.autocomplete).toBe("current-password");

    const show = screen.getByRole("button", { name: "Mostrar senha" });
    expect(show.getAttribute("type")).toBe("button");
    expect(show.getAttribute("aria-pressed")).toBe("false");
    expect(show.getAttribute("aria-controls")).toBe("login-password");

    fireEvent.click(show);

    expect(password.type).toBe("text");
    const hide = screen.getByRole("button", { name: "Ocultar senha" });
    expect(hide.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(hide);
    expect(password.type).toBe("password");
    expect(screen.getByLabelText(/^Senha$/i)).toBe(password);
  });
});
