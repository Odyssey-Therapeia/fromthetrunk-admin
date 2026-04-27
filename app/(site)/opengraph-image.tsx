import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "From the Trunk: Pre-Loved Luxury Sarees";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #3D2B1F 0%, #6B1D1D 50%, #B8860B 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "24px",
          }}
        >
          <div
            style={{
              fontSize: "24px",
              letterSpacing: "0.4em",
              textTransform: "uppercase" as const,
              color: "rgba(245, 240, 232, 0.6)",
            }}
          >
            From the Trunk
          </div>
          <div
            style={{
              fontSize: "56px",
              fontFamily: "Georgia, serif",
              color: "#F5F0E8",
              textAlign: "center",
              lineHeight: 1.2,
              maxWidth: "800px",
            }}
          >
            Pre-Loved Luxury Sarees with Provenance
          </div>
          <div
            style={{
              fontSize: "20px",
              color: "rgba(245, 240, 232, 0.7)",
              textAlign: "center",
              maxWidth: "600px",
              lineHeight: 1.5,
            }}
          >
            Curated heirloom pieces, authenticated and restored with care.
            Each carrying the story that made it timeless.
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
