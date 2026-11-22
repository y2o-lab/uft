import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: "unit",
            include: ["src/**/*.{test,spec}.ts"],
          },
        },
        {
          extends: true,
          plugins: [storybookTest()],
          test: {
            name: "storybook",
            browser: {
              enabled: true,
              headless: true,
              provider: playwright({ launchOptions: { channel: "chromium" } }),
              instances: [{ browser: "chromium" }],
            },
          },
        },
      ],
    },
  }),
);
