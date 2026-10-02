import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Compliance from "./Compliance";

describe("Compliance", () => {
  it("renders title and empty state", () => {
    render(<Compliance />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
