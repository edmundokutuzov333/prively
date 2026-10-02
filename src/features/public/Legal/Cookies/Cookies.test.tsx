import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Cookies from "./Cookies";

describe("Cookies", () => {
  it("renders title and empty state", () => {
    render(<Cookies />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
