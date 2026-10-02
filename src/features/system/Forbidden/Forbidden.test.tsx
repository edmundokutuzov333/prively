import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Forbidden from "./Forbidden";

describe("Forbidden", () => {
  it("renders title and state", () => {
    render(<Forbidden />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
