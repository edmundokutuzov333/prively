import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Refunds from "./Refunds";

describe("Refunds", () => {
  it("renders title and empty state", () => {
    render(<Refunds />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
