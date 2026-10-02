import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Register from "./Register";

describe("Register", () => {
  it("renders title and empty state", () => {
    render(<Register />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
