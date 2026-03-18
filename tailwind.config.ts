import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        base: "#1A1A1E",
        elevated: "#232323",
        accent: {
          DEFAULT: "#2DD4BF",
          light: "#5eead4",
          mid: "#14b8a6",
          muted: "#1a8a7d",
          subtle: "#134e48",
        },
        positive: "#4ade80",
        negative: "#f87171",
        warning: "#fbbf24",
        neutral: "#6b7280",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        card: "10px",
      },
      boxShadow: {
        card: "0 2px 8px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.3)",
        "card-hover": "0 4px 12px rgba(0,0,0,0.4), 0 12px 28px rgba(0,0,0,0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
