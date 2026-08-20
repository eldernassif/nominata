// F0.8.5: o e2e roda contra o preview fiel do Cloudflare (wrangler pages dev),
// não contra o vite preview — só o wrangler aplica _headers/_redirects. O
// webServer encadeia o build e sobe o preview na 4173 (porta do app alinhada
// ao config.toml). globalSetup provisiona o usuário de teste (Admin API + pg).
//
// F0.9: reuseExistingServer FIXO em true, nunca `!process.env.CI`. O
// verify-e2e.ts SEMPRE sobe o preview sozinho antes de chamar o Playwright
// (build + marca de determinismo, ver topo de scripts/verify-e2e.ts) — "um
// preview só, um build só" tem que valer local E em CI. Achado em CI real
// (job e2e, PR #1, run 32325722918): com `!process.env.CI`, no runner
// (CI=true) o webServer do Playwright tentava subir um SEGUNDO preview na
// mesma porta e colidia com o que o verify-e2e.ts já tinha subido — "Error:
// http://127.0.0.1:4173 is already used" — só reproduz com CI setada.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: 'http://127.0.0.1:4173',
  },
  reporter: [['list']],
  webServer: {
    command: 'npm run build && npx wrangler pages dev dist --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
