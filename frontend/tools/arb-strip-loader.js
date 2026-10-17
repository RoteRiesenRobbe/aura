// Strips an ARB file's metadata from the client bundle
// (plan-localization.md C7). Every `@` key (`@@locale`, the translator notes,
// placeholders, `x-maxLength`) is for translators and the pins, never read at
// runtime: `parseArb` drops them anyway. The source ARBs keep everything; only
// the bundled copy is stripped, and it stays a string (`?raw`), so the import
// sites and their typing are untouched.
module.exports = function arbStripLoader(source) {
	const arb = JSON.parse(source);
	Object.keys(arb).forEach(key => {
		if (key.charAt(0) === '@') {
			delete arb[key];
		}
	});
	return JSON.stringify(arb);
};
