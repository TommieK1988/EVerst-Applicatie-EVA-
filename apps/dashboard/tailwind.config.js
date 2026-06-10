const path = require('path')

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@everts/config/tailwind.config.base.js')],
  content: [
    path.resolve(__dirname, 'src/**/*.{js,ts,jsx,tsx,mdx}').replace(/\\/g, '/'),
  ],
}
