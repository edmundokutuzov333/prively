import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Purchases from "./Purchases";

describe("Purchases", () => {
  it("renders title and empty state", () => {
    render(<Purchases />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
