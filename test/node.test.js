// Drives Penfield.execute() through a fake n8n context, one test per operation.
// Run after `npm run build`.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Penfield } = require('../dist/nodes/Penfield/Penfield.node.js');

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const node = { name: 'Penfield', type: 'n8n-nodes-penfield.penfield', typeVersion: 1 };
const rl = (value) => ({ __rl: true, mode: 'id', value });
const ok = (data) => ({ status: 'success', data });

function apiError(status, code, message) {
	const error = new Error(`Request failed with status code ${status}`);
	error.httpCode = String(status);
	error.response = { status, data: { status: 'error', error: { code, message } } };
	return error;
}

/**
 * Runs the node once with `params`. `routes` maps "METHOD /path" to a
 * function (body, qs) returning the API answer, or throwing.
 */
async function run(params, routes = {}, { continueOnFail = false } = {}) {
	const calls = [];
	const ctx = {
		getInputData: () => [{ json: {} }],
		getNode: () => node,
		continueOnFail: () => continueOnFail,
		getNodeParameter(name, _i, fallback, options) {
			const value = name in params ? params[name] : fallback;
			if (options?.extractValue && value && typeof value === 'object' && '__rl' in value) {
				return value.value;
			}
			return value;
		},
		helpers: {
			async httpRequestWithAuthentication(type, options) {
				const path = options.url.split('/api/v2')[1];
				const key = `${options.method} ${path}`;
				calls.push({ type, key, body: options.body, qs: options.qs });
				const handler = routes[key];
				if (!handler) throw apiError(404, 'RES_NOT_FOUND', `No route ${key}`);
				return handler(options.body, options.qs ?? {});
			},
			constructExecutionMetaData: (items, { itemData }) =>
				items.map((item) => ({ ...item, pairedItem: itemData })),
			returnJsonArray: (data) => (Array.isArray(data) ? data : [data]).map((json) => ({ json })),
		},
	};
	const [items] = await new Penfield().execute.call(ctx, ...[]);
	return { items, out: items.map((i) => i.json), calls };
}

const base = { authentication: 'apiKey' };
const memory = (op, extra = {}) => ({ ...base, resource: 'memory', operation: op, ...extra });

const MEMORY = {
	id: A,
	content: 'Blue packaging',
	memory_type: 'fact',
	importance: 0.6,
	confidence: 0.8,
	tags: ['launch'],
	source_type: 'direct_input',
	created_at: '2026-11-21T00:00:00Z',
	updated_at: '2026-11-21T00:00:00Z',
	user_id: 'internal',
	embedding_status: 'completed',
};

// ------------------------------------------------------------------ auth

test('the sign-in credential is used when Authentication is set to it', async () => {
	const { calls } = await run(
		{ authentication: 'oAuth2', resource: 'memory', operation: 'get', memoryId: rl(A) },
		{ [`GET /memories/${A}`]: () => ok(MEMORY) },
	);
	assert.equal(calls[0].type, 'penfieldOAuth2Api');
	const key = await run(memory('get', { memoryId: rl(A) }), {
		[`GET /memories/${A}`]: () => ok(MEMORY),
	});
	assert.equal(key.calls[0].type, 'penfieldApi');
});

// ---------------------------------------------------------------- memory

test('memory create sends what was given and simplifies the answer', async () => {
	const { out, calls } = await run(
		memory('create', {
			content: '  Blue packaging  ',
			additionalFields: { memoryType: 'fact', importance: 0.6, tags: 'launch, Project X' },
		}),
		{ 'POST /memories': () => ok(MEMORY) },
	);
	assert.deepEqual(calls[0].body, {
		content: 'Blue packaging',
		memory_type: 'fact',
		importance: 0.6,
		tags: ['launch', 'Project X'],
	});
	assert.ok(Object.keys(out[0]).length <= 10);
	assert.equal(out[0].user_id, undefined);
});

test('memory create counts characters, not UTF-16 units', async () => {
	const routes = { 'POST /memories': () => ok(MEMORY) };
	const fine = await run(memory('create', { content: '🦊'.repeat(10000) }), routes);
	assert.equal(fine.calls.length, 1);
	await assert.rejects(
		run(memory('create', { content: '🦊'.repeat(10001) }), routes),
		/Content is 10,001 characters/,
	);
});

test('memory create refuses a tag Penfield would not store, before any request', async () => {
	const { out, calls } = await run(
		memory('create', { content: 'x', additionalFields: { tags: 'ok,!' } }),
		{},
		{ continueOnFail: true },
	);
	assert.match(out[0].error, /Tag 2 \("!"\) would not be stored/);
	assert.equal(calls.length, 0);
});

test('memory update sends only the changed fields; empty tags clears them', async () => {
	const { calls } = await run(
		memory('update', { memoryId: rl(A), updateFields: { importance: 0.9, tags: '' } }),
		{ [`PUT /memories/${A}`]: (body) => ok({ ...MEMORY, ...body }) },
	);
	assert.deepEqual(calls[0].body, { importance: 0.9, tags: [] });
	await assert.rejects(
		run(memory('update', { memoryId: rl(A), updateFields: {} }), {}),
		/at least one field/,
	);
});

test('memory get, raw and simplified', async () => {
	const routes = { [`GET /memories/${A}`]: () => ok(MEMORY) };
	const simple = await run(memory('get', { memoryId: rl(A) }), routes);
	assert.equal(simple.out[0].embedding_status, undefined);
	const raw = await run(memory('get', { memoryId: rl(A), simplify: false }), routes);
	assert.equal(raw.out[0].embedding_status, 'completed');
	await assert.rejects(run(memory('get', { memoryId: rl('not-a-uuid') }), routes), /UUID/);
});

test('memory delete', async () => {
	const { out } = await run(memory('delete', { memoryId: rl(A) }), {
		[`DELETE /memories/${A}`]: () => undefined,
	});
	assert.deepEqual(out, [{ deleted: true }]);
});

test('memory get many pages and filters', async () => {
	const page = (qs) =>
		ok({
			items: qs.page === 1 ? [MEMORY, { ...MEMORY, id: B }] : [{ ...MEMORY, id: 'c' }],
			pagination: { has_next: qs.page === 1 },
		});
	const { out, calls } = await run(
		memory('getAll', {
			returnAll: true,
			filters: { tags: 'launch', memoryType: 'fact' },
			sort: { field: 'importance', direction: 'asc' },
		}),
		{ 'GET /memories': (_b, qs) => page(qs) },
	);
	assert.equal(out.length, 3);
	assert.equal(calls.length, 2);
	assert.equal(calls[0].qs.tags, 'launch');
	assert.equal(calls[0].qs.memory_type, 'fact');
	assert.equal(calls[0].qs.sort, 'importance');
	const limited = await run(memory('getAll', { returnAll: false, limit: 1 }), {
		'GET /memories': (_b, qs) => page(qs),
	});
	assert.equal(limited.out.length, 1);
	assert.equal(limited.calls[0].qs.per_page, 1);
});

const HIT = {
	id: A,
	content: 'Blue packaging',
	score: 0.8,
	metadata: { memory_type: 'fact', importance: 0.6 },
	source_type: 'direct_input',
	tags: ['launch'],
	created_at: 't',
};

test('memory search, hybrid and by meaning', async () => {
	const routes = { 'POST /search/hybrid': () => ok({ items: [HIT] }) };
	const hybrid = await run(memory('search', { query: 'packaging', limit: 5 }), routes);
	assert.deepEqual(hybrid.calls[0].body, { query: 'packaging', limit: 5 });
	assert.equal(hybrid.out[0].memory_type, 'fact');
	const meaning = await run(
		memory('search', { query: 'packaging', limit: 5, searchMode: 'semantic' }),
		routes,
	);
	assert.deepEqual(meaning.calls[0].body, {
		query: 'packaging',
		limit: 5,
		bm25_weight: 0.1,
		vector_weight: 0.7,
		graph_weight: 0.2,
	});
	await assert.rejects(
		run(memory('search', { query: '🦊'.repeat(4001) }), routes),
		/Query is 4001 characters/,
	);
	const fourThousand = await run(memory('search', { query: '🦊'.repeat(4000) }), routes);
	assert.equal(fourThousand.calls.length, 1);
});

test('memory search, memories only, searches again without the filter when empty', async () => {
	const doc = { ...HIT, id: B, source_type: 'document_upload' };
	const { out, calls } = await run(
		memory('search', { query: 'q', limit: 2, searchFilters: { source: 'memories' } }),
		{ 'POST /search/hybrid': (body) => ok({ items: body.source_types ? [] : [doc, HIT] }) },
	);
	assert.equal(calls.length, 2);
	assert.equal(calls[1].body.limit, 6);
	assert.equal('source_types' in calls[1].body, false);
	assert.deepEqual(
		out.map((r) => r.id),
		[A],
	);
});

test('memory reflect: named windows, day windows and dates', async () => {
	const answer = () =>
		ok({
			time_window: 'w',
			statistics: { total_memories_analyzed: 3 },
			active_topics: [],
			memories: [],
		});
	const routes = { 'POST /analysis/reflect': answer };
	const week = await run(memory('reflect', { timeWindow: 'week' }), routes);
	assert.deepEqual(week.calls[0].body, { include_documents: false, time_window: 'week' });
	assert.equal(week.out[0].memories_analyzed, 3);
	const day = await run(
		memory('reflect', { timeWindow: '1d', reflectOptions: { includeDocuments: true } }),
		routes,
	);
	assert.equal(day.calls[0].body.include_documents, true);
	assert.equal('time_window' in day.calls[0].body, false);
	assert.ok(Date.now() - Date.parse(day.calls[0].body.start_date) < 86_400_000 + 60_000);
	const dated = await run(
		memory('reflect', { timeWindow: '90d', reflectOptions: { startDate: '2026-01-01' } }),
		routes,
	);
	assert.equal(dated.calls[0].body.start_date, new Date('2026-01-01').toISOString());
});

// ---------------------------------------------------------- relationship

const rel = (op, extra = {}) => ({ ...base, resource: 'relationship', operation: op, ...extra });

test('relationship create, delete and get many', async () => {
	const created = await run(
		rel('create', {
			fromMemoryId: rl(B),
			toMemoryId: rl(A),
			relationshipType: 'updates',
			additionalFields: { strength: 0.8, reason: 'changed' },
		}),
		{ 'POST /relationships': (body) => ok({ id: 'r1', ...body }) },
	);
	assert.deepEqual(created.calls[0].body, {
		from_id: B,
		to_id: A,
		relationship_type: 'updates',
		strength: 0.8,
		evidence: { reason: 'changed', source: 'n8n' },
	});
	await assert.rejects(
		run(rel('create', { fromMemoryId: rl(A), toMemoryId: rl(A), relationshipType: 'updates' })),
		/cannot be linked to itself/,
	);
	const deleted = await run(rel('delete', { fromMemoryId: rl(B), toMemoryId: rl(A) }), {
		'DELETE /relationships/between': () => undefined,
	});
	assert.deepEqual(deleted.calls[0].qs, { from_id: B, to_id: A });
	assert.deepEqual(deleted.out, [{ deleted: true }]);
	const many = await run(
		rel('getAll', { memoryId: rl(A), returnAll: true, filters: { direction: 'incoming' } }),
		{
			'GET /relationships': () => ok({ items: [{ id: 'r1' }], pagination: { has_next: false } }),
		},
	);
	assert.equal(many.calls[0].qs.to_id, A);
	assert.equal(many.out.length, 1);
});

test('relationship explore returns memories and links', async () => {
	const { out, calls } = await run(rel('explore', { memoryId: rl(B), maxDepth: 1 }), {
		'POST /relationships/traverse': () =>
			ok({
				total_paths_found: 1,
				node_details: { [A]: { preview: 'Blue', type: 'fact', importance: 0.6, tags: [] } },
				relationship_details: {
					r1: { from_id: B, to_id: A, type: 'updates', strength: 0.8 },
				},
			}),
	});
	assert.deepEqual(calls[0].body, { start_memory_id: B, max_depth: 1, direction: 'ANY' });
	assert.equal(out[0].memories[0].id, A);
	assert.equal(out[0].relationships[0].relationship_type, 'updates');
});

// -------------------------------------------------------------- artifact

const art = (op, extra = {}) => ({ ...base, resource: 'artifact', operation: op, ...extra });

test('artifact create, get, get many and delete', async () => {
	const created = await run(art('create', { path: '/p/notes.md', content: '# Hi' }), {
		'POST /artifacts': (body) => ok({ path: body.path, artifact_id: 'a1', size: 4 }),
	});
	assert.deepEqual(created.calls[0].body, { path: '/p/notes.md', content: '# Hi' });
	assert.equal(created.out[0].artifact_id, 'a1');
	const got = await run(art('get', { path: '/p/notes.md' }), {
		'GET /artifacts': (_b, qs) => ok({ path: qs.path, content: '# Hi' }),
	});
	assert.equal(got.out[0].content, '# Hi');
	const listed = await run(art('getAll', { folder: '/p/' }), {
		'GET /artifacts/list': () => ok({ folders: ['sub'], files: [{ name: 'notes.md', size: 4 }] }),
	});
	assert.equal(listed.calls[0].qs.prefix, '/p');
	assert.deepEqual(
		listed.out.map((x) => x.path),
		['/p/sub', '/p/notes.md'],
	);
	const deleted = await run(art('delete', { path: '/p/notes.md' }), {
		'DELETE /artifacts': () => ok({ message: 'deleted' }),
	});
	assert.deepEqual(deleted.out, [{ deleted: true }]);
	await assert.rejects(run(art('get', { path: '/../x' })), /Invalid artifact path/);
});

// --------------------------------------------------------------- context

const ctxParams = (op, extra = {}) => ({ ...base, resource: 'context', operation: op, ...extra });

function checkpointRoutes(existing = []) {
	const items = existing.map((name, n) => ({
		id: `00000000-0000-4000-8000-00000000000${n}`,
		memory_type: 'checkpoint',
		content: JSON.stringify({ checkpoint_name: name, memory_ids: [A], memory_count: 1 }),
	}));
	return {
		'GET /memories': (_b, qs) =>
			ok({
				items: qs.memory_type === 'checkpoint' ? items : [MEMORY],
				pagination: { has_next: false },
			}),
		'POST /search/hybrid': () => ok({ items: [{ id: A, score: 0.9 }] }),
		'POST /memories': (body) => ok({ id: B, ...body }),
		[`GET /memories/${A}`]: () => ok(MEMORY),
	};
}

test('context save writes a checkpoint; a taken name fails the node', async () => {
	const saved = await run(
		ctxParams('save', { name: 'handoff', description: 'Packaging work, next confirm green.' }),
		checkpointRoutes(),
	);
	assert.equal(saved.out[0].success, true);
	const post = saved.calls.find((c) => c.key === 'POST /memories');
	assert.deepEqual(post.body.metadata, { checkpoint_name: 'handoff' });
	await assert.rejects(
		run(
			ctxParams('save', { name: 'handoff', description: 'again' }),
			checkpointRoutes(['handoff']),
		),
		/already exists/,
	);
	const soft = await run(
		ctxParams('save', { name: 'handoff', description: 'again' }),
		checkpointRoutes(['handoff']),
		{ continueOnFail: true },
	);
	assert.match(soft.out[0].error, /already exists/);
	assert.equal(soft.calls.filter((c) => c.key === 'POST /memories').length, 0);
});

test('context save counts the name and description in characters', async () => {
	await assert.rejects(
		run(ctxParams('save', { name: '🦊'.repeat(201) }), checkpointRoutes()),
		/at most 200 characters/,
	);
	const ok200 = await run(ctxParams('save', { name: '🦊'.repeat(200) }), checkpointRoutes());
	assert.equal(ok200.out[0].success, true);
});

test('context restore loads the memories; an unknown name fails the node', async () => {
	const restored = await run(
		ctxParams('restore', { name: 'handoff', maxMemories: 20 }),
		checkpointRoutes(['handoff']),
	);
	assert.equal(restored.out[0].success, true);
	assert.equal(restored.out[0].memories[0].id, A);
	await assert.rejects(
		run(ctxParams('restore', { name: 'nope' }), checkpointRoutes(['handoff'])),
		/No checkpoint found with name 'nope'/,
	);
});

test('context get many', async () => {
	const { out } = await run(
		ctxParams('getAll', { limit: 10, contextOptions: { namePattern: 'HAND' } }),
		checkpointRoutes(['handoff', 'other']),
	);
	assert.equal(out[0].total, 1);
	assert.equal(out[0].contexts[0].name, 'handoff');
});

// ----------------------------------------------------------- personality

test('personality get briefing', async () => {
	const { out } = await run(
		{ ...base, resource: 'personality', operation: 'getBriefing' },
		{ 'GET /personality/awakening': () => ok({ briefing: 'brief' }) },
	);
	assert.deepEqual(out, [{ briefing: 'brief' }]);
});

// ---------------------------------------------------------------- errors

test('API errors carry Penfield message; continue on fail returns it as data', async () => {
	const routes = {
		[`DELETE /memories/${A}`]: () => {
			throw apiError(403, 'AUTH_INSUFFICIENT_PERMISSIONS', 'Insufficient permissions');
		},
	};
	await assert.rejects(
		run(memory('delete', { memoryId: rl(A) }), routes),
		/Insufficient permissions\. Check that the API key has the permission/,
	);
	const soft = await run(memory('delete', { memoryId: rl(A) }), routes, { continueOnFail: true });
	assert.match(soft.out[0].error, /Insufficient permissions/);
	assert.deepEqual(soft.items[0].pairedItem, { item: 0 });
});
