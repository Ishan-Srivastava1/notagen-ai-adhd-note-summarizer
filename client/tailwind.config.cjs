/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  safelist: [
    {
      // enables dynamic classes like border-${color}-300 and chip bg/text/border
      pattern: /(bg|text|border)-(indigo|violet|sky|emerald|amber|orange|rose|slate)-(100|200|300|800)/,
    },
  ],
  theme: { extend: {} },
  plugins: [],
};
