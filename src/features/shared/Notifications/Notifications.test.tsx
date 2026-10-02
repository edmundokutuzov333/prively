import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Notifications from "./Notifications";

describe("Notifications", () => {
  it("renders title and empty state", () => {
    render(<Notifications />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
