import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Encounters from "./Encounters";

describe("Encounters", () => {
  it("renders title and empty state", () => {
    render(<Encounters />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
