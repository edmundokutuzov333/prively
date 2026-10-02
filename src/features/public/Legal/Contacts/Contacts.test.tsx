import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Contacts from "./Contacts";

describe("Contacts", () => {
  it("renders title and empty state", () => {
    render(<Contacts />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
