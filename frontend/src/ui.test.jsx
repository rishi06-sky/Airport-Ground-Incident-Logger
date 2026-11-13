import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
// Import the real reusable diagram/data rendering module below.
import { PriorityLabel, filterIncidents } from "./view-utils.jsx";
describe("incident views", () => {
  it("renders the critical priority with an accessible label", () => {
    render(<PriorityLabel priority={0} />);
    expect(screen.getByLabelText("Priority: Critical").textContent).toBe(
      "Critical",
    );
  });
  it("searches both report IDs and aircraft registrations", () => {
    const rows = [
      { reportId: "AGIL-2026-000001", aircraftRegistration: "VT-ABC" },
      { reportId: "AGIL-2026-000002", aircraftRegistration: "VT-XYZ" },
    ];
    expect(filterIncidents(rows, "vt-abc")).toHaveLength(1);
    expect(filterIncidents(rows, "000002")[0].aircraftRegistration).toBe(
      "VT-XYZ",
    );
    expect(filterIncidents(rows, "missing")).toEqual([]);
  });
});
