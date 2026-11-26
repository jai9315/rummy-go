import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./client/src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./client/src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./client/src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        table: {
          light: "#125434",
          DEFAULT: "#0b3a24",
          dark: "#062316",
        },
        gold: {
          light: "#f6e082",
          DEFAULT: "#d4af37",
          dark: "#aa820a",
        },
      },
      backgroundImage: {
        "felt-pattern": "radial-gradient(circle at 50% 50%, #155e39 0%, #0b3a24 60%, #062316 100%)",
        "gold-gradient": "linear-gradient(135deg, #f6e082 0%, #d4af37 50%, #aa820a 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
