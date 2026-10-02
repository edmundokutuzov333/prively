import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Referral from "./Referral";

describe("Referral", () => {
  it("renders title and empty state", () => {
    render(<Referral />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
