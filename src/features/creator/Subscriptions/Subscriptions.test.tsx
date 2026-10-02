import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Subscriptions from "./Subscriptions";

describe("Subscriptions", () => {
  it("renders title and empty state", () => {
    render(<Subscriptions />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
