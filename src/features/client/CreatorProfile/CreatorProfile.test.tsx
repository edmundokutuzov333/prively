import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CreatorProfile from "./CreatorProfile";

describe("CreatorProfile", () => {
  it("renders title and empty state", () => {
    render(<CreatorProfile />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
