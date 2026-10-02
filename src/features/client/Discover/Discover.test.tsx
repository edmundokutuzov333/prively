import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Discover from "./Discover";

describe("Discover", () => {
  it("renders title and empty state", () => {
    render(<Discover />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
