import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Devices from "./Devices";

describe("Devices", () => {
  it("renders title and empty state", () => {
    render(<Devices />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
