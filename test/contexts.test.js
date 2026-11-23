// Unit tests for tag rules and context checkpoints. Run after `npm run build`.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fn = require('../dist/nodes/Penfield/GenericFunctions.js');
const ctxFn = require('../dist/nodes/Penfield/ContextFunctions.js');

const node = { name: 'Penfield', type: 'n8n-nodes-penfield.penfield' };
const ctx = { getNode: () => node };

test('tags follow the rules Penfield stores them by', () => {
	assert.equal(fn.storedTag('  My Tag_Name!! '), 'my-tag-name');
	assert.equal(fn.storedTag('a--b'), 'a-b');
	assert.equal(fn.tagProblem('ok'), undefined);
	assert.match(fn.tagProblem('!'), /would not be stored/);
	assert.match(fn.tagProblem('a'.repeat(51)), /too long/);
	assert.deepEqual(fn.parseTags.call(ctx, 'Project X, decision', 0, true), [
		'Project X',
		'decision',
	]);
	assert.throws(() => fn.parseTags.call(ctx, 'ok,!', 0, true), /Tag 2 \("!"\) would not be stored/);
	// Filters are not checked: Penfield matches them as given.
	assert.deepEqual(fn.parseTags.call(ctx, '!', 0), ['!']);
});

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const C = 'cccccccc-0000-4000-8000-000000000003';

/** A fake Penfield API behind the node's request helper. */
function fakeApi() {
	const memories = new Map();
	const calls = [];
	const created = [];
	let searchItems = [];
	let n = 0;
	const add = (id, content = 'm', memory_type = 'fact') =>
		memories.set(id, { id, content, memory_type, tags: [] });
	const checkpoint = (name, ids = [], refs = []) => {
		n++;
		const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
		memories.set(id, {
			id,
			memory_type: 'checkpoint',
			created_at: `2026-11-${n}`,
			content: JSON.stringify({
				checkpoint_name: name,
				description: `about ${name}`,
				memory_count: ids.length,
				memory_ids: ids,
				referenced_memories: refs,
			}),
		});
		return id;
	};
	const self = {
		getNode: () => node,
		getNodeParameter: (name, _i, fallback) => (name === 'authentication' ? 'apiKey' : fallback),
		getInputData: () => [{ json: {} }],
		helpers: {
			async httpRequestWithAuthentication(type, options) {
				const path = options.url.split('/api/v2')[1];
				calls.push({ type, method: options.method, path, body: options.body, qs: options.qs });
				const ok = (data) => ({ status: 'success', data });
				if (options.method === 'GET' && path === '/memories') {
					const qs = options.qs ?? {};
					let items = [...memories.values()];
					if (qs.memory_type) items = items.filter((m) => m.memory_type === qs.memory_type);
					items.reverse();
					const per = Number(qs.per_page ?? 20);
					const page = Number(qs.page ?? 1);
					return ok({
						items: items.slice((page - 1) * per, page * per),
						pagination: { page, has_next: page * per < items.length, total: items.length },
					});
				}
				if (options.method === 'GET' && path.startsWith('/memories/')) {
					const m = memories.get(path.split('/')[2]);
					if (!m) {
						const e = new Error('Not found');
						e.httpCode = '404';
						throw e;
					}
					return ok(m);
				}
				if (options.method === 'POST' && path === '/memories') {
					created.push(options.body);
					return ok({ id: `11111111-0000-4000-8000-${String(created.length).padStart(12, '0')}` });
				}
				if (options.method === 'POST' && path === '/search/hybrid')
					return ok({ items: searchItems });
				if (path === '/personality/awakening') return ok({ briefing: 'brief' });
				throw new Error(`unexpected ${options.method} ${path}`);
			},
		},
	};
	return {
		self,
		add,
		checkpoint,
		calls,
		created,
		setSearch: (items) => {
			searchItems = items;
		},
	};
}

test('save writes the MCP checkpoint format', async () => {
	const api = fakeApi();
	api.add(A);
	api.add(C);
	api.setSearch([
		{ id: A, score: 0.9 },
		{ id: B, score: 0.2 },
	]);
	const result = await ctxFn.saveContext.call(
		api.self,
		'Auth bug 2026-11-21',
		`Found the auth bug. See memory_id: ${C} and memory_id: ${B.toUpperCase()}`,
	);
	const body = api.created[0];
	assert.equal(body.memory_type, 'checkpoint');
	assert.equal('source_type' in body, false, 'Penfield sets the source itself');
	assert.equal(body.importance, 0.9);
	assert.deepEqual(body.tags, ['checkpoint', 'context', 'Auth bug 2026-11-21']);
	assert.deepEqual(body.metadata, { checkpoint_name: 'Auth bug 2026-11-21' });
	const saved = JSON.parse(body.content);
	assert.deepEqual(Object.keys(saved), [
		'checkpoint_name',
		'description',
		'memory_count',
		'memory_ids',
		'referenced_memories',
	]);
	assert.deepEqual(saved.memory_ids, [A]);
	assert.deepEqual(saved.referenced_memories, [C]);
	assert.equal(result.references_extracted, 2);
	assert.equal(result.references_resolved, 1);
	assert.deepEqual(result.unresolved_references, [`memory_id: ${B}`]);
	const search = api.calls.find((c) => c.path === '/search/hybrid');
	assert.deepEqual(search.body, {
		query: `Found the auth bug. See memory_id: ${C} and memory_id: ${B.toUpperCase()}`.slice(
			0,
			200,
		),
		limit: 30,
		min_score_threshold: 0.25,
	});
	assert.ok(api.calls.every((c) => c.type === 'penfieldApi'));
});

test('a short description links the most recent memories', async () => {
	const api = fakeApi();
	api.add(A);
	api.add(B);
	const result = await ctxFn.saveContext.call(api.self, 'wip', 'wip');
	assert.ok(!api.calls.some((c) => c.path === '/search/hybrid'));
	assert.deepEqual(JSON.parse(api.created[0].content).memory_ids, [B, A]);
	assert.equal(result.memories_included, 2);
});

test('a taken name is refused and nothing is saved', async () => {
	const api = fakeApi();
	api.checkpoint('taken');
	const result = await ctxFn.saveContext.call(api.self, 'taken', 'one two three');
	assert.equal(result.error_code, 'DUPLICATE_NAME');
	assert.equal(api.created.length, 0);
});

test('a name that cannot be a tag is left out of the tags', async () => {
	const api = fakeApi();
	await ctxFn.saveContext.call(api.self, '!!', 'a');
	assert.deepEqual(api.created[0].tags, ['checkpoint', 'context']);
});

test('restore loads the saved and referenced memories', async () => {
	const api = fakeApi();
	api.add(A, 'first');
	api.add(B, 'second');
	const gone = 'dddddddd-0000-4000-8000-000000000004';
	const id = api.checkpoint('handoff', [A, gone], [B]);
	const result = await ctxFn.restoreContext.call(api.self, 'handoff', 20);
	assert.equal(result.context_id, id);
	assert.equal(result.description, 'about handoff');
	assert.deepEqual(
		result.memories.map((m) => m.id),
		[A, B],
	);
	assert.equal(result.saved_count, 3);
	assert.equal(result.truncated, false);
	assert.equal((await ctxFn.restoreContext.call(api.self, id, 20)).context_id, id);
	const limited = await ctxFn.restoreContext.call(api.self, 'handoff', 1);
	assert.equal(limited.count, 1);
	assert.equal(limited.truncated, true);
	assert.deepEqual(await ctxFn.restoreContext.call(api.self, 'Handoff', 20), {
		success: false,
		error: "No checkpoint found with name 'Handoff'",
	});
	assert.equal((await ctxFn.restoreContext.call(api.self, A, 20)).success, false);
	assert.deepEqual(await ctxFn.restoreContext.call(api.self, 'Awakening', 20), {
		name: 'awakening',
		briefing: 'brief',
	});
});

test('list filters, pages and counts across every page', async () => {
	const api = fakeApi();
	for (let i = 0; i < 3; i++) api.checkpoint(`sprint ${i}`);
	api.checkpoint('Release');
	api.add(A);
	let result = await ctxFn.listContexts.call(api.self, {
		limit: 2,
		offset: 0,
		namePattern: '',
		includeDescriptions: false,
	});
	assert.deepEqual(
		result.contexts.map((c) => c.name),
		['Release', 'sprint 2'],
	);
	assert.equal(result.total, 4);
	assert.equal(result.has_more, true);
	result = await ctxFn.listContexts.call(api.self, {
		limit: 20,
		offset: 1,
		namePattern: 'SPRINT',
		includeDescriptions: true,
	});
	assert.deepEqual(
		result.contexts.map((c) => c.name),
		['sprint 1', 'sprint 0'],
	);
	assert.equal(result.contexts[0].description, 'about sprint 1');

	const many = fakeApi();
	for (let i = 0; i < 205; i++) many.checkpoint(`c${i}`);
	result = await ctxFn.listContexts.call(many.self, {
		limit: 20,
		offset: 0,
		namePattern: 'c0',
		includeDescriptions: false,
	});
	assert.equal(result.total, 1);
	assert.deepEqual(
		many.calls.filter((c) => c.path === '/memories').map((c) => c.qs.page),
		[1, 2, 3],
	);
});

test('the node uses the sign-in credential when set to it', () => {
	const asOAuth = { getNodeParameter: () => 'oAuth2', getInputData: () => [] };
	const asKey = { getNodeParameter: () => 'apiKey', getInputData: () => [] };
	const loadOptions = { getNodeParameter: (_n, fallback) => fallback };
	assert.equal(fn.credentialType.call(asOAuth), 'penfieldOAuth2Api');
	assert.equal(fn.credentialType.call(asKey), 'penfieldApi');
	assert.equal(fn.credentialType.call(loadOptions), 'penfieldApi');
});
