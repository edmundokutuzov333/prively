import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Profile from "./Profile";

describe("Profile", () => {
  it("renders title and empty state", () => {
    render(<Profile />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
