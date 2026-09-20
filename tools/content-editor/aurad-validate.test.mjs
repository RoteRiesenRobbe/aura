#!/usr/bin/env node
/**
 * Unit checks for the two parts of the save seam that must NOT be exercised
 * against the repo: the stale-binary guard and the candidate path guard.
 *
 * ⚑ EVERY FIXTURE LIVES IN A TEMP DIRECTORY. Proving the freshness guard bites
 * means making a source file newer than the binary, and doing that to a real
 * backend/*.go would rewrite a repo file's mtime for a test. So the guard takes
 * its backend directory as an argument and this builds fake ones.
 *
 *     node tools/content-editor/aurad-validate.test.mjs   # standalone
 *
 * smoke.mjs calls selfTestFindings() as leg (g) instead of spawning this.
 */
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertAuradFresh, candidateSegments } from './aurad-validate.mjs';

const OLD = new Date('2020-01-01T00:00:00Z');
const NEW = new Date('2030-01-01T00:00:00Z');

// Builds a fake backend/ with one binary and a set of files, each stamped old
// or new, and returns both paths.
function fixture(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'aura-fresh-'));
  const backend = path.join(root, 'backend');
  mkdirSync(backend, { recursive: true });
  const bin = path.join(backend, 'aurad');
  writeFileSync(bin, 'binary');
  utimesSync(bin, OLD, OLD);
  for (const [rel, when] of Object.entries(files)) {
    const abs = path.join(backend, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, 'package main');
    utimesSync(abs, when === 'new' ? NEW : OLD, when === 'new' ? NEW : OLD);
  }
  return { root, backend, bin };
}

function expectThrow(findings, label, fn, expectedSubstring) {
  let threw = null;
  try { fn(); } catch (err) { threw = err; }
  if (!threw) { findings.push(`${label}: expected a throw, got none`); return; }
  if (expectedSubstring && !String(threw.message).includes(expectedSubstring)) {
    findings.push(`${label}: throw did not mention ${JSON.stringify(expectedSubstring)} (got ${JSON.stringify(threw.message)})`);
  }
}

function expectNoThrow(findings, label, fn) {
  try { fn(); } catch (err) { findings.push(`${label}: unexpected throw ${JSON.stringify(err.message)}`); }
}

export function selfTestFindings() {
  const findings = [];
  const cases = [];

  // The guard bites: a .go file newer than the binary.
  {
    const f = fixture({ 'cmd/aurad/aurad.go': 'new' });
    cases.push(f.root);
    expectThrow(findings, 'assertAuradFresh(stale binary)', () => assertAuradFresh(f.bin, f.backend), 'cmd/aurad/aurad.go');
  }
  // go.mod and go.sum count as sources too.
  {
    const f = fixture({ 'go.sum': 'new' });
    cases.push(f.root);
    expectThrow(findings, 'assertAuradFresh(newer go.sum)', () => assertAuradFresh(f.bin, f.backend), 'go.sum');
  }
  // A current binary passes.
  {
    const f = fixture({ 'cmd/aurad/aurad.go': 'old' });
    cases.push(f.root);
    expectNoThrow(findings, 'assertAuradFresh(fresh binary)', () => assertAuradFresh(f.bin, f.backend));
  }
  // A _test.go is not compiled into the binary, so it must not make it stale.
  {
    const f = fixture({ 'cmd/aurad/aurad_test.go': 'new' });
    cases.push(f.root);
    expectNoThrow(findings, 'assertAuradFresh(newer _test.go)', () => assertAuradFresh(f.bin, f.backend));
  }
  // backend/pkg/api/ is the embedded CONTENT copy. The seam always passes
  // -content, so a cp-defs that has not run cannot change the answer and must
  // not be reported as a stale binary.
  {
    const f = fixture({ 'pkg/api/skills/embed.go': 'new' });
    cases.push(f.root);
    expectNoThrow(findings, 'assertAuradFresh(newer pkg/api)', () => assertAuradFresh(f.bin, f.backend));
  }

  for (const root of cases) rmSync(root, { recursive: true, force: true });

  // The path guard: what may be written into the temp tree.
  const accepted = ['api/skills/aegis.json', 'api/skills/mobs/bandit-heal.json', 'api/factions/wildlife_predator.json', 'api/milestones/milestone-unlocks.json'];
  for (const file of accepted) {
    expectNoThrow(findings, `candidateSegments(${file})`, () => candidateSegments(file));
  }
  const rejected = ['../etc/passwd', '/etc/passwd', 'api/../backend/conf.json', 'api/schema/aura.fbs', 'api/skills/a/b/c.json', 'backend/conf.json', 'api/skills/aegis.txt'];
  for (const file of rejected) {
    expectThrow(findings, `candidateSegments(${file})`, () => candidateSegments(file));
  }
  expectThrow(findings, 'candidateSegments(undefined)', () => candidateSegments(undefined));

  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const findings = selfTestFindings();
  for (const line of findings) console.log(line);
  console.log(`${findings.length} finding(s) in the save seam's unit checks`);
  process.exit(findings.length > 0 ? 1 : 0);
}
