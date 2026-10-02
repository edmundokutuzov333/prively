import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Login from "./Login";

describe("Login", () => {
  it("renders title and empty state", () => {
    render(<Login />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
