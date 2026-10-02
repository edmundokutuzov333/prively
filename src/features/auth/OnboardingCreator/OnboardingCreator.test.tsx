import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import OnboardingCreator from "./OnboardingCreator";

describe("OnboardingCreator", () => {
  it("renders title and empty state", () => {
    render(<OnboardingCreator />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("page-shell-empty")).toBeInTheDocument();
  });
});
