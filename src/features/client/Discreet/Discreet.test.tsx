import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Discreet from "./Discreet";

describe("Discreet", () => {
  it("renders title and empty state", () => {
    render(<Discreet />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
