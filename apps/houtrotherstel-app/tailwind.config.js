const path = require('path')

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@everts/config/tailwind.config.base.js')],
  content: [
    path.resolve(__dirname, 'src/pages/**/*.{js,ts,jsx,tsx,mdx}').replace(/\\/g, '/'),
    path.resolve(__dirname, 'src/components/**/*.{js,ts,jsx,tsx,mdx}').replace(/\\/g, '/'),
    path.resolve(__dirname, 'src/app/**/*.{js,ts,jsx,tsx,mdx}').replace(/\\/g, '/'),
  ],
}
