import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CustomRequests from "./CustomRequests";

describe("CustomRequests", () => {
  it("renders title and empty state", () => {
    render(<CustomRequests />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
