import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      APP_MODE: 'local',
      ALPERA_LOCAL_STORAGE: '1',
      APP_URL: 'http://127.0.0.1:3100',
      DATA_DIR: `.local/e2e-${Date.now()}`,
      DATA_ENCRYPTION_KEY: 'dGVzdC1vbmx5LWtleS0wMTIzNDU2Nzg5MDEyMzQ1Njc=',
      TOKEN_SECRET: 'dGVzdC1vbmx5LWtleS0wMTIzNDU2Nzg5MDEyMzQ1Njc=',
      LOCAL_ADMIN_PASSWORD: 'synthetic-e2e-only-password',
      LOCAL_ADMIN_TOTP_CODE: '654321',
      DOCUMENTS_ENABLED: 'true',
      SIGNATURE_ENABLED: 'true',
      RESIDENCE_DOCUMENT_ENABLED: 'true',
      RESIDENCE_DOCUMENT_REQUIRED: 'false',
      REQUIRED_FIELDS:
        '["identityNumber","identityType","name","province","district","neighborhood","phone","address","nationality","occupation","amount"]',
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
