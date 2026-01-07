tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#195de6",
        "background-light": "#f6f6f8",
        "background-dark": "#111621",
        "surface-dark": "#1a1d24", // Custom surface color for cards
      },
      fontFamily: {
        display: ["Inter", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px",
      },
    },
  },
};
