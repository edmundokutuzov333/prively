import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProductionGate from "./ProductionGate";

describe("ProductionGate", () => {
  it("renders title and empty state", () => {
    render(<ProductionGate />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
