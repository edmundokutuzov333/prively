import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Goals from "./Goals";

describe("Goals", () => {
  it("renders title and empty state", () => {
    render(<Goals />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
