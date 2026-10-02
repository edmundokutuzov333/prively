import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Receipts from "./Receipts";

describe("Receipts", () => {
  it("renders title and empty state", () => {
    render(<Receipts />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
