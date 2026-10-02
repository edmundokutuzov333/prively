import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Studio from "./Studio";

describe("Studio", () => {
  it("renders title and empty state", () => {
    render(<Studio />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
