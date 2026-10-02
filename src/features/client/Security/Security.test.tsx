import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Security from "./Security";

describe("Security", () => {
  it("renders title and empty state", () => {
    render(<Security />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
