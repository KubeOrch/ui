import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NavigationSidebar } from "../NavigationSidebar";

describe("NavigationSidebar", () => {
  it("shows a neutral unchecked status instead of an operational claim", () => {
    render(<NavigationSidebar />);

    expect(screen.getByText("Status not checked")).toBeTruthy();
    expect(screen.queryByText("All systems operational")).toBeNull();
  });
});
