const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const svgToMiniDataURI = require('mini-svg-data-uri');
const FaviconWebpackPlugin = require('favicons-webpack-plugin');


module.exports = {
	entry: './src/index.ts',
	plugins: [
		new HtmlWebpackPlugin({
			title: 'Aura',
			xhtml: true,
			meta: {
				viewport: 'width=device-width, initial-scale=1, user-scalable=no, interactive-widget=resizes-content',
				// Address-bar tint on mobile. Used to come from the favicons android
				// platform; that platform is off (see below), so it is authored here.
				'theme-color': '#E66CEF'
			}
		}),
		new FaviconWebpackPlugin({
			logo: './src/features/user-interface/assets/logo.svg',
			publicPath: '.',
			prefix: '',
			inject: true,
			favicons: {
				appName: 'Aura',
				appDescription: 'A 2D multiplayer stone age survival game',
				developerName: 'Team Dodo',
				developerURL: 'https://berryhunter.io',
				theme_color: '#E66CEF',
				version: 'Open Beta',
				icons: {
					// Aura is played in the browser; it is deliberately NOT installable.
					// The android platform is the one that writes manifest.webmanifest and
					// injects <link rel="manifest">, which is all Chrome needs to offer
					// "Install Aura" on a phone. Leaving it on shipped a broken install:
					// the plugin's start_url is a relative URL resolved against the
					// manifest, so the empty string we passed pointed the shortcut at the
					// manifest file itself and the installed app rendered raw JSON.
					// Turning the platform off removes the manifest, the link tag and the
					// install offer together. Turn it back on (with a real start_url of
					// '/') only if a PWA is actually wanted.
					android: false
				}
			}
		}),
	],

	resolve: {
		// Add '.ts' as resolvable extensions.
		extensions: ['.ts', '.js'],
		// Generated FlatBuffers bindings use explicit .js extensions (ESM style);
		// map them to .ts so webpack finds the source files.
		extensionAlias: {
			'.js': ['.ts', '.js'],
		},
		// flatbuffers is installed under frontend/node_modules but imported by
		// generated files under api/schema/js/ which are outside this tree.
		alias: {
			flatbuffers: path.resolve(__dirname, 'node_modules/flatbuffers'),
		},
	},

	module: {
		rules: [
			{
				test: /\.ts$/,
				use: 'ts-loader',
				exclude: /node_modules/,
			},

			{
				test: /\.html$/,
				use: [{
					loader: 'html-loader',
					options: {
						minimize: true,
					}
				}],
			},

			// All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
			{enforce: 'pre', test: /\.js$/, loader: 'source-map-loader'},

			{
				test: /\.svg$/,
				type: 'asset/inline',
				generator: {
					dataUrl: content => svgToMiniDataURI(content.toString()),
				},
			},

			// https://webpack.js.org/guides/asset-modules/#resource-assets
			{
				test: /\.(png|jpg|gif|eot|ttf|woff|woff2)$/,
				resourceQuery: { not: [/raw/] },
				type: 'asset',
			},

			{
				test: /\.(mustache)$/,
				type: 'asset/source'
			},

			{
				resourceQuery: /raw/,
				type: 'asset/source',
			},

			{
				test: /\.mp3$/,
				type: 'asset/resource'
			}
		]
	},

	output: {
		filename: '[name].[contenthash].js',
		path: path.resolve(__dirname, 'dist')
	},
};
