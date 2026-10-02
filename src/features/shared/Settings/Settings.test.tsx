import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Settings from "./Settings";

describe("Settings", () => {
  it("renders title and empty state", () => {
    render(<Settings />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
