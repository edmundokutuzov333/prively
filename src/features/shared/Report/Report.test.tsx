import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Report from "./Report";

describe("Report", () => {
  it("renders title and empty state", () => {
    render(<Report />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
