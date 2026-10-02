import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Store from "./Store";

describe("Store", () => {
  it("renders title and empty state", () => {
    render(<Store />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
