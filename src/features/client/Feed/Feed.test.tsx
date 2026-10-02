import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Feed from "./Feed";

describe("Feed", () => {
  it("renders title and empty state", () => {
    render(<Feed />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
