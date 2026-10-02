import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ForbiddenContent from "./ForbiddenContent";

describe("ForbiddenContent", () => {
  it("renders title and empty state", () => {
    render(<ForbiddenContent />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
