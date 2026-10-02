import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Users from "./Users";

describe("Users", () => {
  it("renders title and empty state", () => {
    render(<Users />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
