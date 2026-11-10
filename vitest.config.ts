import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Same config as the build, plus one exclusion: local agent worktrees under
// .claude/worktrees are full checkouts with their own test folders, which
// vitest would otherwise run as part of this tree's suite.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      exclude: [...configDefaults.exclude, '.claude/**'],
    },
  }),
);
