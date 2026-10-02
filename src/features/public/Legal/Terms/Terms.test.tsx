import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Terms from "./Terms";

describe("Terms", () => {
  it("renders title and empty state", () => {
    render(<Terms />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
