import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import BecomeCreator from "./BecomeCreator";

describe("BecomeCreator", () => {
  it("renders title and empty state", () => {
    render(<MemoryRouter><BecomeCreator /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
