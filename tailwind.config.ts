import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#faf6ee",
        ink: "#1a1815",
        oxblood: "#7a1f1f",
        sage: "#5a634d",
        rule: "#d9d2c1",
        muted: "#7a7268",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
