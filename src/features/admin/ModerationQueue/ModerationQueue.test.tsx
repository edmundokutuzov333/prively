import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ModerationQueue from "./ModerationQueue";

describe("ModerationQueue", () => {
  it("renders title and empty state", () => {
    render(<ModerationQueue />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
