import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Fans from "./Fans";

describe("Fans", () => {
  it("renders title and empty state", () => {
    render(<Fans />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
