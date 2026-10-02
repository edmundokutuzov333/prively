import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import KycQueue from "./KycQueue";

describe("KycQueue", () => {
  it("renders the real queue surface and weekly volume heading", () => {
    render(<KycQueue />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Volume manual")).toBeInTheDocument();
  });
});
