import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Error from "./Error";

describe("Error", () => {
  it("renders title and state", () => {
    render(<Error />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
