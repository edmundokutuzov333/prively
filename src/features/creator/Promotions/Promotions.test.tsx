import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Promotions from "./Promotions";

describe("Promotions", () => {
  it("renders title and empty state", () => {
    render(<Promotions />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
