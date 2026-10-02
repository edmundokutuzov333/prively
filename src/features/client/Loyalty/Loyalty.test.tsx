import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Loyalty from "./Loyalty";

describe("Loyalty", () => {
  it("renders title and empty state", () => {
    render(<Loyalty />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
