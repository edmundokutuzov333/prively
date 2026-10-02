import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Wishlist from "./Wishlist";

describe("Wishlist", () => {
  it("renders title and empty state", () => {
    render(<Wishlist />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
