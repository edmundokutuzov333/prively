import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Privacy from "./Privacy";

describe("Privacy", () => {
  it("renders title and empty state", () => {
    render(<Privacy />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
