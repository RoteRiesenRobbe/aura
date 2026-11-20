// node --test tools/content-editor/validate-ceremony.test.mjs
// (plan-ascension-ceremony.md AC1, D2/D12): validate.mjs mirrors the loader's
// ceremony refusals, so the editor says so before aurad's boot does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, validateInteraction } from './validate.mjs';

const catalog = { id: 'catalog', lines: [{ id: 'pick', text: 'pick' }], rows: 'ascension_catalog', rewards: [] };
const stone = (interaction) => ({ name: 'Stone', interaction });
const problems = (interaction) =>
  validateInteraction(stone(interaction), buildIndex([], [], [])).map((e) => e.message).join(' | ');

test('a stone listing its step validates', () => {
  assert.doesNotMatch(problems({ ceremony: ['catalog'], nodes: [catalog] }), /ceremony/);
});

test('every ceremony refusal of the loader is mirrored', () => {
  const root = { id: 'root', lines: [{ id: 'hi', text: 'hi' }] };
  for (const [name, interaction, want] of [
    ['names no node', { ceremony: ['catalog', 'nowhere'], nodes: [catalog] }, /"nowhere", which is not a node/],
    ['names a node twice', { ceremony: ['catalog', 'catalog'], nodes: [catalog] }, /twice/],
    ['names a non-step', { ceremony: ['catalog', 'root'], nodes: [catalog, root] }, /"root", which is not a step/],
    ['is empty', { ceremony: [], nodes: [catalog] }, /at least one step/],
    ['leaves a step out', { nodes: [catalog] }, /does not list it/],
    ['takes the summary id', { ceremony: ['catalog'], nodes: [catalog, { ...root, id: 'ceremony-summary' }] }, /reserved/],
    ['authors the summary source', { nodes: [{ ...root, rows: 'ascension_summary' }] }, /must be one of/],
  ]) {
    assert.match(problems(interaction), want, name);
  }
});

// plan-ascension-ceremony.md AC2, D7: a look step's shape, ported from
// mobs.mapLooks (aurad checks each id names a stone gift of the slot).
const look = (extra) => ({ id: 'look', lines: [{ id: 'face', text: 'a face' }], rows: 'ascension_looks', ...extra });

test('a look step validates', () => {
  const out = problems({ ceremony: ['catalog', 'look'],
    nodes: [catalog, look({ slot: 'portrait', looks: ['crowned-heir', 'elder-sage'] })] });
  assert.equal(out, '');
});

test('every look-step refusal of the loader is mirrored', () => {
  const root = { id: 'root', lines: [{ id: 'hi', text: 'hi' }] };
  for (const [name, node, want] of [
    ['no slot', look({ looks: ['a'] }), /slot/],
    ['an unknown slot', look({ slot: 'hat', looks: ['a'] }), /slot/],
    ['no looks', look({ slot: 'ring' }), /looks/],
    ['an empty list', look({ slot: 'ring', looks: [] }), /looks/],
    ['one look twice', look({ slot: 'ring', looks: ['a', 'a'] }), /twice/],
    ['an empty id', look({ slot: 'ring', looks: [' '] }), /looks/],
    ['looks on another node', { ...root, id: 'look', looks: ['a'] }, /only for an ascension_looks node/],
    ['slot on another node', { ...root, id: 'look', slot: 'ring' }, /only for an ascension_looks node/],
  ]) {
    assert.match(problems({ ceremony: ['catalog', 'look'], nodes: [catalog, node] }), want, name);
  }
});
