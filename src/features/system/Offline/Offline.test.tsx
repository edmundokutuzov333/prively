import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Offline from "./Offline";

describe("Offline", () => {
  it("renders title and state", () => {
    render(<Offline />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
