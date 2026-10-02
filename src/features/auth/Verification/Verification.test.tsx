import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Verification from "./Verification";

describe("Verification", () => {
  it("renders title and empty state", () => {
    render(<Verification />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
