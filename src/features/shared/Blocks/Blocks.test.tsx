import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Blocks from "./Blocks";

describe("Blocks", () => {
  it("renders title and empty state", () => {
    render(<Blocks />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
