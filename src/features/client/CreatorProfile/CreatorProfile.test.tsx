import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CreatorProfile from "./CreatorProfile";

describe("Public Creator Profile", () => {
  it("renders the public profile route with a real page state contract", () => {
    render(<CreatorProfile />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
