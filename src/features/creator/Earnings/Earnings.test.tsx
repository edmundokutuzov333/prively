import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Earnings from "./Earnings";

describe("Earnings", () => {
  it("renders title and empty state", () => {
    render(<Earnings />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
