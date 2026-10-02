import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Account from "./Account";

describe("Account", () => {
  it("renders title and empty state", () => {
    render(<Account />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
