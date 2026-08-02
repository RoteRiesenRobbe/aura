#!/usr/bin/env node
/**
 * Bot name generator for the verify harnesses.
 *
 * Every harness used to join as `'Quest' + pid.slice(-4)` — correct, unique,
 * and joyless. This builds a character name out of *what the run is testing*,
 * so the nameplate in a screenshot says what the screenshot is for, and the
 * server log reads like a guest list instead of a serial-number dump.
 *
 *   import {botName} from './botname.mjs';
 *   await page.fill('#startForm .playerNameInput', botName('quest'));
 *   // -> "QuestDoer the Quest"
 *
 * CLI:
 *   node botname.mjs quest                 one name
 *   node botname.mjs --all charm           every candidate, to eyeball the lists
 *   node botname.mjs --seed=7 empty prune  reproducible
 *
 * ⚑ HARD CONSTRAINT: PlayerName.ts caps the name at 20 chars (MAX_LENGTH) and
 * the input carries maxlength="20", so anything longer is silently cut mid-word
 * — "QuestWrangler the Q". Candidates over budget are dropped, never truncated.
 */

const MAX_LENGTH = 20; // must match frontend/src/features/player/logic/PlayerName.ts

// Words that say nothing about what is under test.
const STOPWORDS = new Set([
	'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with',
	'test', 'tests', 'testing', 'verify', 'check', 'harness', 'probe', 'run',
	'chunk', 'bug', 'fix', 'fixes', 'new', 'my', 'this', 'that', 'it',
]);

// Titles. Short ones do the heavy lifting — a long subject leaves no room.
const TITLES = [
	'Brave', 'Damp', 'Bold', 'Mild', 'Loud', 'Hasty', 'Sudden', 'Sleepy',
	'Patient', 'Doomed', 'Curious', 'Untested', 'Unpaid', 'Confused',
	'Reluctant', 'Adequate', 'Thorough', 'Unemployed', 'Inevitable',
	'Regrettable', 'Turnipless', 'Well-Meaning', 'Barely Legal', 'Ninth',
	'Third', 'Frankly Tired', 'Deeply Fine', 'Not Sorry',
];

// What the bot does to the thing it is testing.
const AGENTS = [
	'Doer', 'Haver', 'Enjoyer', 'Poker', 'Prodder', 'Nudger', 'Sniffer',
	'Knower', 'Denier', 'Liker', 'Toucher', 'Fancier', 'Botherer', 'Wrangler',
	'Whisperer', 'Respecter', 'Appreciator',
];

// Honorifics, in descending dignity.
const HONORIFICS = [
	'Sir', 'Ser', 'Madam', 'Baron', 'Captain', 'Doctor', 'Admiral', 'Sergeant',
	'Professor', 'Uncle', 'Auntie', 'Lil', 'Big', 'Old', 'Young', 'Saint',
];

// Numerals, for a bot that has clearly done this before.
const NUMERALS = ['II', 'III', 'IV', 'IX', 'XI', 'XL', 'the 2nd', 'the 9th', '9000'];

// When the topic word is too long to build on, the bot gets a local job instead.
const LOCALS = [
	'Turnip', 'Campfire', 'Boarbane', 'Emberkeep', 'Lampholder', 'Wolfsbane',
	'Fencepost', 'Puddle', 'Compass', 'Beetroot',
];

/** FNV-1a — small, stable, and enough for picking words out of a hat. */
function hash(s) {
	let h = 0x811c9dc5;
	for (const ch of String(s)) {
		h ^= ch.codePointAt(0);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h;
}

const pick = (list, seed, slot) => list[hash(`${slot}|${seed}`) % list.length];

/**
 * The distinctive word of a topic. "quest journal" -> "Quest", "shield bar" ->
 * "Shield". The FIRST content word wins as long as it leaves room to build on
 * (topics are written subject-first); only when it is unwieldy does the
 * shortest word take over, so "webgl context loss" still yields "Loss".
 */
export function subjectOf(topic) {
	const words = String(topic || '')
		.split(/[^A-Za-z]+/)
		.filter((w) => w.length > 2 && !STOPWORDS.has(w.toLowerCase()));
	if (words.length === 0) return 'Aura';
	const shortest = words.slice().sort((a, b) => a.length - b.length)[0];
	const best = words[0].length <= 7 ? words[0] : shortest;
	return best[0].toUpperCase() + best.slice(1, 9).toLowerCase();
}

/**
 * Every name this subject could carry, best first. Over-budget candidates are
 * dropped here, never clipped — a clipped name reads as a crash ("QuestDoer
 * the Q"). The LOCALS forms are a genuine last resort: they name no subject at
 * all, so they only appear when the subject is too long to build anything on.
 */
export function candidates(subject, seed) {
	const s = subject;
	const title = pick(TITLES, seed, 'title');
	const agent = pick(AGENTS, seed, 'agent');
	const honorific = pick(HONORIFICS, seed, 'hon');
	const numeral = pick(NUMERALS, seed, 'num');
	const local = pick(LOCALS, seed, 'local');

	const topical = [
		{form: 'agent-echo', name: `${s}${agent} the ${s}`},   // QuestDoer the Quest
		{form: 'mcface', name: `${s}y Mc${s}face`},            // Questy McQuestface
		{form: 'the-title', name: `${s} the ${title}`},        // Charm the Doomed
		{form: 'alot', name: `${honorific} ${s}alot`},         // Sir Questalot
		{form: 'hon-agent', name: `${honorific} ${s}${agent}`},// Baron CharmPoker
		{form: 'agent-numeral', name: `${s}${agent} ${numeral}`}, // PruneSniffer IX
		{form: 'comma-title', name: `${s}, the ${title}`},     // Prune, the Unpaid
		{form: 'hon-numeral', name: `${honorific} ${s} ${numeral}`}, // Old Charm XL
		{form: 'bane', name: `${s}bane the ${title}`},         // Wolfbane the Mild
	].filter((c) => c.name.length <= MAX_LENGTH);

	if (topical.length > 0) return topical;

	return [
		{form: 'local-title', name: `${local} the ${title}`}, // Turnip the Untested
		{form: 'hon-local', name: `${honorific} ${local}`},   // Auntie Fencepost
		{form: 'local', name: local},                         // Beetroot — always fits
	].filter((c) => c.name.length <= MAX_LENGTH);
}

/** Every form id, in template order. */
export const FORMS = [
	'agent-echo', 'mcface', 'the-title', 'alot', 'hon-agent',
	'agent-numeral', 'comma-title', 'hon-numeral', 'bane',
];

/**
 * @param {string} topic  what this run is testing, e.g. 'quest journal'
 * @param {{seed?: string|number, form?: string}} [opts]  seed defaults to the
 *        pid, so two concurrent runs of the same harness get different bots;
 *        pass one to make a run reproducible. `form` pins the template (see
 *        FORMS) — it searches seeds for one where that form fits the 20-char
 *        budget, and returns null if the subject can never wear it.
 * @returns {string|null} a character name of at most 20 characters
 */
export function botName(topic, opts = {}) {
	const subject = subjectOf(topic);
	const base = `${topic}|${opts.seed ?? process.pid}`;

	if (!opts.form) {
		const fits = candidates(subject, base);
		return pick(fits, base, 'name').name;
	}

	// A form's fit depends on the words drawn into it ("Sir Questalot" fits,
	// "Professor Questalot" does not), so walk seeds until the form appears.
	for (let i = 0; i < 200; i++) {
		const seed = i === 0 ? base : `${base}#${i}`;
		const hit = candidates(subject, seed).find((c) => c.form === opts.form);
		if (hit) return hit.name;
	}
	return null;
}

// --- CLI ---------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
	const argv = process.argv.slice(2);
	const seedArg = argv.find((a) => a.startsWith('--seed='));
	const topic = argv.filter((a) => !a.startsWith('--')).join(' ');
	const opts = seedArg ? {seed: seedArg.split('=')[1]} : {};

	const formArg = argv.find((a) => a.startsWith('--form='));
	if (formArg) opts.form = formArg.split('=')[1];

	if (argv.includes('--all')) {
		const seed = `${topic}|${opts.seed ?? process.pid}`;
		for (const c of candidates(subjectOf(topic), seed)) {
			console.log(`${String(c.name.length).padStart(2)}  ${c.form.padEnd(14)} ${c.name}`);
		}
	} else {
		console.log(botName(topic, opts) ?? '');
	}
}
