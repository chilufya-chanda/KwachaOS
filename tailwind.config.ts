import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx,js,jsx,mdx}",
    "./src/components/**/*.{ts,tsx,js,jsx,mdx}",
  ],

  theme: {
    extend: {
      colors: {
        kwacha: {
          black: "#0A0A0A",
          "gray-900": "#141414",
          "gray-800": "#1E1E1E",
          "gray-700": "#2A2A2A",
          "gray-500": "#6B6B6B",
          "gray-400": "#858585",
          "gray-300": "#A3A3A3",
          gold: "#C9A24B",
          "gold-bright": "#E5C878",
        },
      },

      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },

  plugins: [],
};

export default config;