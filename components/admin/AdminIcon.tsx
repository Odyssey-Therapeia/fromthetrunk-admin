import React from "react";

/**
 * Compact icon for the Payload admin (favicon area / collapsed sidebar).
 * Shows a minimal "FTT" monogram in the brand colors.
 */
export const AdminIcon = () => {
  return (
    <div
      style={{
        width: "24px",
        height: "24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Trunk body */}
        <rect
          x="3"
          y="9"
          width="22"
          height="14"
          rx="2.5"
          stroke="#6b1d1d"
          strokeWidth="2"
          fill="none"
        />
        {/* Trunk lid arc */}
        <path
          d="M3 12C3 9.5 5.5 7 9 7H19C22.5 7 25 9.5 25 12"
          stroke="#6b1d1d"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        {/* Lock clasp */}
        <rect
          x="12"
          y="14"
          width="4"
          height="4"
          rx="1"
          fill="#b8860b"
        />
      </svg>
    </div>
  );
};
