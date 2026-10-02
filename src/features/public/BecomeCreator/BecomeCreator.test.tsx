import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BecomeCreator from "./BecomeCreator";

describe("BecomeCreator", () => {
  it("renders title and empty state", () => {
    render(<BecomeCreator />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
