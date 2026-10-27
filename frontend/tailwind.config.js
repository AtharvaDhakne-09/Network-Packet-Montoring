/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          950: "#070b14",
          900: "#0b1220",
          850: "#0f1729",
          800: "#131c31",
          700: "#1c2740",
          600: "#27324e",
        },
        accent: {
          DEFAULT: "#22d3ee",
          soft: "#0e7490",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Consolas", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
