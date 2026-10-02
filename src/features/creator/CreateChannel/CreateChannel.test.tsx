import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CreateChannel from "./CreateChannel";

describe("CreateChannel", () => {
  it("renders title and empty state", () => {
    render(<CreateChannel />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
