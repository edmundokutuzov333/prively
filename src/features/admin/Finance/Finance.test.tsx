import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Finance from "./Finance";

describe("Finance", () => {
  it("renders title and empty state", () => {
    render(<Finance />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
