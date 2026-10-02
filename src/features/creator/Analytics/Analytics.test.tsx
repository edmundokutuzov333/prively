import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Analytics from "./Analytics";

describe("Analytics", () => {
  it("renders title and empty state", () => {
    render(<Analytics />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
