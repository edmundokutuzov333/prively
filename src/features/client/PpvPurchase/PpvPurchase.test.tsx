import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PpvPurchase from "./PpvPurchase";

describe("PpvPurchase", () => {
  it("renders title and empty state", () => {
    render(<PpvPurchase />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
