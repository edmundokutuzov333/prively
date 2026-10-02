import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import OnboardingClient from "./OnboardingClient";

describe("OnboardingClient", () => {
  it("renders title and empty state", () => {
    render(<OnboardingClient />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
