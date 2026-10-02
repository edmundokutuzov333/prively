import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Subscribe from "./Subscribe";

describe("Subscribe", () => {
  it("renders title and empty state", () => {
    render(<Subscribe />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
