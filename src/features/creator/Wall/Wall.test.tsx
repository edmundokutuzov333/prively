import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Wall from "./Wall";

describe("Wall", () => {
  it("renders title and empty state", () => {
    render(<Wall />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
