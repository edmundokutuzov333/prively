import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Wallet from "./Wallet";

describe("Wallet", () => {
  it("renders title and empty state", () => {
    render(<Wallet />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
