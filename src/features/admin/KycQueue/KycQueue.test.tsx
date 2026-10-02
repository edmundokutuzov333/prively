import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import KycQueue from "./KycQueue";

describe("KycQueue", () => {
  it("renders title and empty state", () => {
    render(<KycQueue />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
