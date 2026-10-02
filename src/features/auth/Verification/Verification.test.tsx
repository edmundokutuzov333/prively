import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Verification from "./Verification";

describe("Verification", () => {
  it("renders the real verification entry state while auth is loading", () => {
    render(<Verification />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toHaveAttribute("data-page-state", "loading");
  });
});
