import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Auctions from "./Auctions";

describe("Auctions", () => {
  it("renders title and empty state", () => {
    render(<Auctions />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
