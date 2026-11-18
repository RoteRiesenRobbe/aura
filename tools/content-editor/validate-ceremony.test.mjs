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
