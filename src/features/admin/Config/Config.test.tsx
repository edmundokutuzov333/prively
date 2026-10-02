import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Config from "./Config";

describe("Config", () => {
  it("renders title and empty state", () => {
    render(<Config />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
