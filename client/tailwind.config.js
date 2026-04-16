export default {
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                ink: "#241910",
                parchment: "#f6eddc",
                ember: "#8a3b12",
                cedar: "#4d3824",
                moss: "#70815f",
            },
            boxShadow: {
                card: "0 24px 60px rgba(36, 25, 16, 0.16)",
            },
            fontFamily: {
                display: ["Georgia", "serif"],
                body: ["'Noto Serif SC'", "Georgia", "serif"],
            },
        },
    },
    plugins: [],
};
