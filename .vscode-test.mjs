import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'build/test/suite/**/*.test.js',
	launchArgs: ['--disable-extensions'],
});
