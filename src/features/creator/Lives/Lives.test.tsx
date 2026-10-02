import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Lives from "./Lives";

describe("Lives", () => {
  it("renders title and empty state", () => {
    render(<Lives />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
