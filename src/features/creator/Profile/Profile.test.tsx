import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Profile from "./Profile";

describe("Creator Profile", () => {
  it("renders the creator profile route with a real page state contract", () => {
    render(<Profile />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
