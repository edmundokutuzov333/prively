import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import KycQueue from "./KycQueue";

describe("KycQueue", () => {
  it("renders the real queue surface and preserves the page shell contract", () => {
    render(<KycQueue />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/volume manual/i)).toBeInTheDocument();
    expect(screen.queryByTestId("page-shell-empty")).not.toBeInTheDocument();
  });
});
