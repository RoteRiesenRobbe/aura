/**
 * Webpack Configuration used to test in a
 * DEVELOPMENT ENVIRONMENT
 */

const path = require('path');
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = (env) => {
	// Define default environment
	env = merge({
		port: 2001,
		proxy: false
	}, env);

	return merge(common, {
		mode: 'development',

		// Webpack's default dev cache is memory-only, so every dev-server restart
		// rebuilt all ~2200 modules from scratch — a measured 47 s, which is what
		// made dev-restart-windows.sh sit on "Waiting for localhost:2001".
		// On disk that is 24 s, and the module graph survives a restart.
		//
		// 24 s is the FLOOR while ts-loader type-checks (PO call 2026-09-07):
		// the cache skips re-BUILDING unchanged modules, but ts-loader still
		// constructs and checks the whole TS program every run, and that alone is
		// ~24 s. Measured: transpileOnly:true takes the same warm build to ~2 s.
		// So if restarts ever need to be faster than this, the type-check is the
		// only remaining lever — not the cache.
		//
		// buildDependencies invalidates the whole cache when a config file is
		// edited; without it a webpack.*.js change would be silently ignored.
		// Cache lives in node_modules/.cache/webpack (~158 MB, already gitignored);
		// delete that directory if a build ever looks impossibly stale.
		cache: {
			type: 'filesystem',
			buildDependencies: {
				config: [__filename, path.resolve(__dirname, 'webpack.common.js')],
			},
		},

		module: {
			rules: [
				// https://webpack.js.org/loaders/less-loader/
				{
					test: /\.less$/,
					use: [{
						loader: 'style-loader' // creates style nodes from JS strings
					}, {
						loader: 'css-loader' // translates CSS into CommonJS
					}, {
						loader: 'less-loader' // compiles Less to CSS
					}]
				},
			],
		},

		devtool: 'eval-source-map',
		devServer: {
			static: {
				directory: path.resolve(__dirname, 'dist')
			},
			// open: true, // Open default browser
			hot: true, // Activate Hot Module Replacement (HMR)
			host: '0.0.0.0',
			port: env.port,
			proxy: env.proxy ? [{
				context: ['/chieftain'],
				target: 'http://localhost:3080',
				pathRewrite: {'^/chieftain': ''}
			}] : [],
		}
	});
};
