// F0.8.5: o e2e roda contra o preview fiel do Cloudflare (wrangler pages dev),
// não contra o vite preview — só o wrangler aplica _headers/_redirects. O
// webServer encadeia o build e sobe o preview na 4173 (porta do app alinhada
// ao config.toml). globalSetup provisiona o usuário de teste (Admin API + pg).
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://127.0.0.1:4173',
  },
  reporter: [['list']],
  webServer: {
    command: 'npm run build && npx wrangler pages dev dist --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
