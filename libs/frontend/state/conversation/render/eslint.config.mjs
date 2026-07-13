import baseConfig from '../../../../eslint.config.mjs';

export default [
	// The raw upstream snapshot under .upstream/ is a re-sync reference copy of OpenClaw
	// source (its own paths/style); it is never compiled or shipped, so it is not linted.
	{ ignores: ['**/.upstream/**'] },
	...baseConfig,
];
