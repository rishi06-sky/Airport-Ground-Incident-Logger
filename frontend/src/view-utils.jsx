import React from "react";
export function PriorityLabel({ priority }) {
  const label = ["Critical", "High", "Normal"][priority] || "Unknown";
  return (
    <span
      className={`badge ${label.toLowerCase()}`}
      aria-label={`Priority: ${label}`}
    >
      {label}
    </span>
  );
}
export function filterIncidents(rows, search) {
  const value = search.toLowerCase();
  return rows.filter(
    (r) =>
      r.reportId.toLowerCase().includes(value) ||
      r.aircraftRegistration.toLowerCase().includes(value),
  );
}
