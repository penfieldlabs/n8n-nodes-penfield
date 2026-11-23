// Unit tests for input validation and output shaping. Run after `npm run build`.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fn = require('../dist/nodes/Penfield/GenericFunctions.js');

const ctx = { getNode: () => ({ name: 'Penfield', type: 'n8n-nodes-penfield.penfield' }) };

test('artifact paths follow Penfield rules', () => {
	for (const ok of [
		'/readme.md',
		'/project/docs/api.md',
		'/notes/2026/january/meeting.md',
		'/a-b_c.d/e.txt',
	]) {
		assert.equal(fn.artifactPathProblem(ok), undefined, ok);
	}
	const bad = {
		'readme.md': 'start with /',
		'/': 'file name',
		'/project/': 'file name',
		'/../secrets.txt': '..',
		'/.hidden': 'hidden',
		'//double.txt': '//',
		'/with space.txt': 'only letters',
		'/a/b/c/d/e/f/g/h/i/j/k/file.txt': '10 folders',
	};
	for (const [path, hint] of Object.entries(bad)) {
		const problem = fn.artifactPathProblem(path);
		assert.ok(problem && problem.includes(hint), `${path} -> ${problem}`);
	}
	assert.equal(
		fn.artifactPathProblem('/a/b/c/d/e/f/g/h/i/j/file.txt'),
		undefined,
		'10 folders is fine',
	);
});

test('tags are split, trimmed and capped', () => {
	assert.deepEqual(fn.parseTags.call(ctx, ' a, b,,c ', 0), ['a', 'b', 'c']);
	assert.equal(fn.parseTags.call(ctx, '', 0), undefined);
	assert.deepEqual(fn.parseTags.call(ctx, ['x', ' y '], 0), ['x', 'y']);
	assert.throws(
		() => fn.parseTags.call(ctx, Array.from({ length: 11 }, (_, i) => `t${i}`).join(','), 0),
		/at most 10 tags/,
	);
});

test('memory ids must be UUIDs', () => {
	assert.equal(
		fn.requireUuid.call(ctx, ' 550E8400-e29b-41d4-a716-446655440000 ', 'Memory', 0),
		'550E8400-e29b-41d4-a716-446655440000',
	);
	for (const bad of [
		'',
		'abc',
		'../memories',
		'550e8400e29b41d4a716446655440000',
		'550e8400-e29b-41d4-a716-446655440000/x',
	]) {
		assert.throws(() => fn.requireUuid.call(ctx, bad, 'Memory', 0), /must be a memory ID/, bad);
	}
});

test('content limit is 10,000 characters', () => {
	assert.equal(fn.requireContent.call(ctx, '  hi  ', 0), 'hi');
	assert.equal(fn.requireContent.call(ctx, 'x'.repeat(10000), 0).length, 10000);
	assert.throws(() => fn.requireContent.call(ctx, 'x'.repeat(10001), 0), /10,001 characters/);
	assert.throws(() => fn.requireContent.call(ctx, '   ', 0), /required/);
	assert.equal(fn.requireContent.call(ctx, '', 0, false), undefined);
});

test('folders are normalized', () => {
	assert.equal(fn.requireFolder.call(ctx, '', 0), '/');
	assert.equal(fn.requireFolder.call(ctx, 'project/notes/', 0), '/project/notes');
	assert.throws(() => fn.requireFolder.call(ctx, '/../x', 0), /Invalid folder/);
});

test('simplified memory keeps at most 10 useful fields', () => {
	const raw = {
		id: '1',
		content: 'c',
		memory_type: 'fact',
		importance: 0.5,
		confidence: 0.8,
		surprise_score: 0.5,
		source_type: 'direct_input',
		user_id: 'u',
		access_count: 1,
		last_accessed: null,
		created_at: 't',
		updated_at: 't',
		metadata: {},
		embedding_status: 'completed',
		relationships: [],
		tags: ['a'],
	};
	const simple = fn.simplifyMemory(raw);
	assert.ok(Object.keys(simple).length <= 10);
	assert.deepEqual(Object.keys(simple), [
		'id',
		'content',
		'memory_type',
		'importance',
		'confidence',
		'tags',
		'source_type',
		'created_at',
		'updated_at',
	]);
});

test('search hits are flattened and prefer content with context', () => {
	const hit = fn.simplifySearchResult({
		id: '1',
		content: 'chunk',
		content_with_context: 'chunk with context',
		score: 0.7,
		metadata: { memory_type: 'fact', importance: 0.6 },
		source_type: 'document_upload',
		tags: [],
		created_at: 't',
	});
	assert.equal(hit.content, 'chunk with context');
	assert.equal(hit.memory_type, 'fact');
	assert.equal(hit.importance, 0.6);
});
