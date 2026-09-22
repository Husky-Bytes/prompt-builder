import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../src/utils/builderDrag.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { exports: module.exports });
const { applyBuilderDrop } = module.exports;
const a = { type: 'text', content: 'First' };
const b = { type: 'block', blockId: 'second' };
const c = { type: 'newline' };
const original = [a, b, c];
const contents = result => Array.from(result);

test('dropping the last item into the first gap preserves all segment kinds', () => {
  assert.deepEqual(contents(applyBuilderDrop(original, { kind: 'segment', index: 2 }, 0)), [c, a, b]);
  assert.deepEqual(original, [a, b, c]);
});

test('moving forward accounts for removal before the destination', () => {
  assert.deepEqual(contents(applyBuilderDrop(original, { kind: 'segment', index: 0 }, 3)), [b, c, a]);
  assert.deepEqual(contents(applyBuilderDrop(original, { kind: 'segment', index: 0 }, 2)), [b, a, c]);
});

test('both adjacent gaps are no-ops and invalid source/destination do not mutate', () => {
  for (const gap of [1, 2, -1, 4, 0.5]) assert.equal(applyBuilderDrop(original, { kind: 'segment', index: 1 }, gap), original);
  assert.equal(applyBuilderDrop(original, { kind: 'segment', index: 99 }, 0), original);
});

test('sidebar blocks insert at first, middle, end and into an empty editor', () => {
  for (const gap of [0, 1, 3]) {
    const result = applyBuilderDrop(original, { kind: 'block', id: 'new' }, gap);
    assert.equal(result.length, 4);
    assert.equal(result[gap].blockId, 'new');
    assert.deepEqual(contents(result.filter((_, index) => index !== gap)), original);
  }
  const empty = applyBuilderDrop([], { kind: 'block', id: 'new' }, 0);
  assert.equal(empty.length, 1);
  assert.equal(empty[0].blockId, 'new');
});
