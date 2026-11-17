import type { Config } from "tailwindcss";
export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
      colors: {
        ink: { DEFAULT: "#111827", soft: "#4b5563", faint: "#9ca3af" },
        brand: { 50: "#eef4ff", 100: "#dbe6fe", 500: "#3b6cf6", 600: "#2f56d9", 700: "#2745ad" },
      },
      boxShadow: { card: "0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)" },
    },
  },
  plugins: [],
} satisfies Config;
