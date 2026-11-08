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
      TWILIO_ACCOUNT_SID: envField.string({ context: 'server', access: 'secret' }),
      TWILIO_AUTH_TOKEN: envField.string({ context: 'server', access: 'secret' }),
      TWILIO_VERIFY_SERVICE_SID: envField.string({ context: 'server', access: 'secret' }),
      // Signs the cookie that marks a guest's number as verified; any long random string
      SESSION_SECRET: envField.string({ context: 'server', access: 'secret', min: 32 }),
      // Cloudflare R2 bucket that guests' photos upload to, with an R2 API token's S3 credentials.
      // Optional so the rest of the site still runs without them; only uploads fail.
      R2_ACCOUNT_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
      R2_ACCESS_KEY_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
      R2_SECRET_ACCESS_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      R2_BUCKET: envField.string({ context: 'server', access: 'public', default: 'wedding-media' }),
    },
  },
  vite: {
    plugins: [tailwindcss()]
  }
});
