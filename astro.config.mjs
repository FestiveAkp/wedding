// @ts-check
import { defineConfig, envField } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import netlify from '@astrojs/netlify';

// https://astro.build/config
export default defineConfig({
  site: 'https://meghna-weds-akash.netlify.app',
  // No edge functions here, and the local emulator fails to start with Netlify's bundled Deno
  adapter: netlify({ devFeatures: { edgeFunctions: false, images: true, environmentVariables: false } }),
  env: {
    schema: {
      GOOGLE_SHEET_ID: envField.string({ context: 'server', access: 'secret' }),
      GOOGLE_SERVICE_ACCOUNT_EMAIL: envField.string({ context: 'server', access: 'secret' }),
      GOOGLE_PRIVATE_KEY: envField.string({ context: 'server', access: 'secret' }),
    },
  },
  vite: {
    plugins: [tailwindcss()]
  }
});
