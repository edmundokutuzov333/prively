import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Publish from "./Publish";

describe("Publish", () => {
  it("renders title and empty state", () => {
    render(<Publish />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
