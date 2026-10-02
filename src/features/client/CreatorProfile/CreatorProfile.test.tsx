import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import CreatorProfile from "./CreatorProfile";

describe("Public Creator Profile", () => {
  it("renders the public profile route with a real page state contract", () => {
    render(
      <MemoryRouter>
        <CreatorProfile />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
