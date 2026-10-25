import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // A prior production build emits CommonJS spec files into dist. Running
    // tests after building must execute each source case once, not import the
    // generated CommonJS copies (which cannot require Vitest).
    include: ['src/**/*.spec.ts'],
  },
});
