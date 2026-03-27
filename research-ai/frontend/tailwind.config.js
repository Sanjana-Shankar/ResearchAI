/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          500: '#6366f1',
          600: '#4f46e5',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      typography: {
        invert: {
          css: {
            '--tw-prose-body': '#cbd5e1',
            '--tw-prose-headings': '#f1f5f9',
            '--tw-prose-bold': '#f1f5f9',
            '--tw-prose-code': '#a5b4fc',
            '--tw-prose-pre-bg': 'rgba(255,255,255,0.05)',
            '--tw-prose-bullets': '#64748b',
            '--tw-prose-counters': '#64748b',
            '--tw-prose-links': '#818cf8',
            '--tw-prose-quotes': '#94a3b8',
            '--tw-prose-hr': 'rgba(255,255,255,0.1)',
          },
        },
      },
    },
  },
  plugins: [],
}
