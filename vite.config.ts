import { defineConfig } from 'vite'

export default defineConfig({
  // Relative build URLs work both at /personal-website/ on GitHub Pages and
  // at the root of a future custom domain.
  base: './',
  server: {
    fs: {
      // Supplying this list replaces Vite's defaults, so retain every default
      // denial in addition to the site's private source-media directory.
      deny: [
        '.env',
        '.env.*',
        '.netrc',
        '*.{crt,pem,key,p12,pfx,cer,der}',
        '.npmrc',
        '.yarnrc.yml',
        'id_ed25519',
        'id_rsa',
        '**/.git/**',
        '**/private-assets/**',
      ],
    },
  },
})
