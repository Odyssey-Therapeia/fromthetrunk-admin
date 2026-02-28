import React from "react";

/**
 * Custom logo for the Payload admin sidebar.
 * Shows "From the Trunk" in Cormorant Garamond with a subtle trunk icon.
 */
export const AdminLogo = () => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
        padding: "0.25rem 0",
        textDecoration: "none",
        color: "#2e2017",
      }}
    >
      {/* Trunk / chest icon */}
      <svg
        width="28"
        height="28"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Trunk body */}
        <rect
          x="4"
          y="10"
          width="24"
          height="16"
          rx="3"
          stroke="#6b1d1d"
          strokeWidth="2"
          fill="none"
        />
        {/* Trunk lid */}
        <path
          d="M4 13C4 10.5 6 8 10 8H22C26 8 28 10.5 28 13"
          stroke="#6b1d1d"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        {/* Lock / clasp */}
        <rect
          x="14"
          y="16"
          width="4"
          height="4"
          rx="1"
          fill="#b8860b"
        />
        {/* Decorative stripe */}
        <line
          x1="4"
          y1="18"
          x2="14"
          y2="18"
          stroke="#ede5d8"
          strokeWidth="1"
        />
        <line
          x1="18"
          y1="18"
          x2="28"
          y2="18"
          stroke="#ede5d8"
          strokeWidth="1"
        />
      </svg>

      {/* Wordmark */}
      <div style={{ lineHeight: 1.1 }}>
        <div
          style={{
            fontSize: "0.6rem",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "#b8860b",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          From the
        </div>
        <div
          style={{
            fontSize: "1.15rem",
            fontWeight: 700,
            color: "#6b1d1d",
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            letterSpacing: "-0.02em",
          }}
        >
          Trunk
        </div>
      </div>
    </div>
  );
};
