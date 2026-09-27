import type { Config } from "tailwindcss";

/**
 * WarlyWorks palette: navy (brand) + marigold (accent).
 *  - brand-900 #1E3A8A is the primary: sidebar, primary buttons, headings.
 *  - accent (marigold) is ONLY used as a fill with navy text on top — it is
 *    too light to be used as text on white.
 * Status colours use Tailwind's emerald / sky / amber / red / gray directly.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        canvas: "#F7F8FA",
        brand: {
          50: "#EFF4FF",
          100: "#DBE6FE",
          200: "#BFD3FE",
          300: "#93B4FD",
          400: "#6090FA",
          500: "#3B6EF6",
          600: "#2553EB",
          700: "#1D43D8",
          800: "#1E38AF",
          900: "#1E3A8A",
          950: "#172554",
        },
        accent: {
          50: "#FFFBEB",
          100: "#FEF3C7",
          200: "#FDE68A",
          300: "#FCD34D",
          400: "#FBBF24",
          500: "#F59E0B",
          600: "#D97706",
          700: "#B45309",
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(16 24 40 / 0.05), 0 1px 3px 0 rgb(16 24 40 / 0.06)",
        lift: "0 10px 24px -8px rgb(30 58 138 / 0.25)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
    },
  },
  plugins: [],
};

export default config;
