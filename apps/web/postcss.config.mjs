// Tailwind CSS v4 is wired in through PostCSS — no tailwind.config.js needed;
// theme customisation lives in globals.css via @theme.
const config = {
  plugins: {
    '@tailwindcss/postcss': {}
  }
};

export default config;
