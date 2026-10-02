import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Wellbeing from "./Wellbeing";

describe("Wellbeing", () => {
  it("renders title and empty state", () => {
    render(<Wellbeing />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
