import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Raffles from "./Raffles";

describe("Raffles", () => {
  it("renders title and empty state", () => {
    render(<Raffles />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
