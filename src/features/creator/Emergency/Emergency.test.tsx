import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Emergency from "./Emergency";

describe("Emergency", () => {
  it("renders title and empty state", () => {
    render(<Emergency />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
