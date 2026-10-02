import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Dmca from "./Dmca";

describe("Dmca", () => {
  it("renders title and empty state", () => {
    render(<Dmca />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
