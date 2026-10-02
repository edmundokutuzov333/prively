import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Recover from "./Recover";

describe("Recover", () => {
  it("renders title and empty state", () => {
    render(<Recover />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
