import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { findDependencies } from '../src/core/dependencies';

const sample = JSON.stringify(
  {
    name: 'sample',
    version: '1.0.0',
    scripts: { build: 'tsc' },
    dependencies: { react: '^18.2.0', '@babel/core': '^7.24.0' },
    devDependencies: { typescript: '~5.5.0' },
    peerDependencies: { 'react-dom': '>=18' },
    optionalDependencies: { fsevents: '^2.3.0' },
  },
  null,
  2
);

test('finds dependencies across all four sections', () => {
  const entries = findDependencies(sample);
  const bySection = Object.fromEntries(entries.map((e) => [e.name, e.section]));
  assert.deepEqual(bySection, {
    react: 'dependencies',
    '@babel/core': 'dependencies',
    typescript: 'devDependencies',
    'react-dom': 'peerDependencies',
    fsevents: 'optionalDependencies',
  });
});

test('captures declared ranges', () => {
  const entries = findDependencies(sample);
  const typescript = entries.find((e) => e.name === 'typescript');
  assert.equal(typescript?.declaredRange, '~5.5.0');
});

test('name offsets cover exactly the name, excluding quotes', () => {
  const entries = findDependencies(sample);
  for (const entry of entries) {
    assert.equal(sample.slice(entry.nameStart, entry.nameEnd), entry.name);
    assert.equal(sample[entry.nameStart - 1], '"');
    assert.equal(sample[entry.nameEnd], '"');
  }
});

test('handles scoped package names', () => {
  const entries = findDependencies(sample);
  const scoped = entries.find((e) => e.name === '@babel/core');
  assert.ok(scoped);
  assert.equal(sample.slice(scoped.nameStart, scoped.nameEnd), '@babel/core');
});

test('ignores similarly named non-dependency sections and invalid JSON', () => {
  const text = '{"bundledDependencies": ["x"], "dependenciesMeta": {"y": {}}}';
  assert.deepEqual(findDependencies(text), []);
  assert.deepEqual(findDependencies('not json'), []);
});
