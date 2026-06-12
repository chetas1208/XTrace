import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#080b10",
        panel: "#101620",
        "panel-soft": "#151d29",
        border: "#273244",
        "text-primary": "#eef4ff",
        "text-secondary": "#a8b3c7",
        cyan: {
          signal: "#39d0ff",
        },
        amber: {
          risk: "#f7b955",
        },
        red: {
          risk: "#ff5f6d",
        },
        green: {
          verified: "#61d394",
        },
      },
      boxShadow: {
        "lab-panel": "0 18px 60px rgba(0, 0, 0, 0.28)",
      },
    },
  },
  plugins: [],
};

export default config;
