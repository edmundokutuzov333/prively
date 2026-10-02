import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Support from "./Support";

describe("Support", () => {
  it("renders title and empty state", () => {
    render(<Support />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
