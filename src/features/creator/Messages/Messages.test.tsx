import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Messages from "./Messages";

describe("Messages", () => {
  it("renders title and empty state", () => {
    render(<Messages />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
