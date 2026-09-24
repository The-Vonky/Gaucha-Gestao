// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { App } from "../apps/web/src/app/App";
afterEach(cleanup);
describe("application environment", () => {
  it("shows a friendly state when public Supabase settings are missing", () => {
    // Tests run without VITE_* values, like an unconfigured deployment.
    render(<App />);
    expect(
      screen.getByText(/Ambiente de desenvolvimento não configurado/),
    ).toBeTruthy();
    expect(screen.queryByText("Entrar")).toBeNull();
  });
});
