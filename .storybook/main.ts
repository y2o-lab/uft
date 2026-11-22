import type { StorybookConfig } from "@storybook/svelte-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.ts"],
  addons: ["@storybook/addon-vitest"],
  framework: "@storybook/svelte-vite",
  core: { disableTelemetry: true },
  staticDirs: ["../public/icon.svg"],
  // UFT's hosting headers disallow framing, which Storybook uses for its Canvas.
  viteFinal: async (config) => ({ ...config, publicDir: false }),
};

export default config;
