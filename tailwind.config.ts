import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "SF Pro Display",
          "SF Pro Text",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif"
        ]
      },
      colors: {
        graphite: {
          950: "#08090d",
          900: "#0d1018",
          850: "#111622",
          800: "#171d2b"
        },
        accent: {
          rose: "#ff4778",
          coral: "#ff775c",
          cyan: "#5be7ff",
          lime: "#adff6b"
        }
      },
      boxShadow: {
        glass: "0 24px 80px rgba(0, 0, 0, 0.36)",
        glow: "0 0 60px rgba(255, 71, 120, 0.18)"
      }
    }
  },
  plugins: []
} satisfies Config;
