import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests drive the real built app in a browser — the layer the unit
 * tests can't reach (Konva canvas, dialogs, keyboard, theme). CI and a local
 * `npm run e2e` both build once and serve on 3100.
 */
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Local machines can be memory-constrained; one worker keeps a single browser
  // in flight. CI has the headroom for Playwright's default parallelism.
  workers: process.env.CI ? undefined : 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // CI installs its own Chromium; for a local run you can point at any
        // Chromium-based browser (Brave/Chrome) instead of downloading one:
        //   PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/brave npm run e2e
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
  },
});
