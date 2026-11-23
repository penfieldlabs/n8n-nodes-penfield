import type { IDataObject, IExecuteFunctions, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import { charCount, penfieldApiRequest, tagProblem } from './GenericFunctions';

/*
 * Context checkpoints, built from memories and search over the REST API in
 * the format Penfield's MCP server uses, so a checkpoint saved in n8n
 * restores in Claude or any other Penfield client and the other way round.
 *
 * A checkpoint is a memory of type `checkpoint` whose content is JSON:
 * {checkpoint_name, description, memory_count, memory_ids, referenced_memories}.
 */

const LINK_SCORE = 0.25;
const MIN_QUERY_WORDS = 3;
const RECENT_FALLBACK = 20;
const PAGE_SIZE = 100;
const MAX_CHECKPOINT_PAGES = 100;
const FETCH_CONCURRENCY = 5;
export const RESULT_CONTENT_MAX_CHARS = 2000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEMORY_ID_REF = /memory_id:\s*([0-9a-f-]{36})/gi;
const MEMORY_PHRASE_REF = /memory:\s*["']([^"']+)["']/gi;

interface Checkpoint {
	memory: IDataObject;
	saved: IDataObject;
}

export function checkpointPayload(memory: IDataObject): IDataObject {
	try {
		const parsed = JSON.parse(String(memory.content ?? '{}')) as unknown;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as IDataObject)
			: {};
	} catch {
		return {};
	}
}

/** Every checkpoint, newest first. */
async function allCheckpoints(this: IExecuteFunctions): Promise<Checkpoint[]> {
	const out: Checkpoint[] = [];
	for (let page = 1; page <= MAX_CHECKPOINT_PAGES; page++) {
		const data = await penfieldApiRequest.call(this, 'GET', '/memories', undefined, {
			memory_type: 'checkpoint',
			per_page: PAGE_SIZE,
			page,
		});
		const items = ((data?.items as IDataObject[]) ?? []).filter((m) => m && typeof m === 'object');
		for (const memory of items) out.push({ memory, saved: checkpointPayload(memory) });
		const pagination = (data?.pagination ?? {}) as IDataObject;
		const hasNext =
			pagination.has_next === undefined ? items.length === PAGE_SIZE : Boolean(pagination.has_next);
		if (!items.length || !hasNext) break;
	}
	return out;
}

async function matchingIds(
	this: IExecuteFunctions,
	query: string,
	limit: number,
): Promise<string[]> {
	const data = await penfieldApiRequest.call(this, 'POST', '/search/hybrid', {
		query,
		limit,
		min_score_threshold: LINK_SCORE,
	});
	return ((data?.items as IDataObject[]) ?? [])
		.filter((it) => it?.id && typeof it.score === 'number' && it.score >= LINK_SCORE)
		.map((it) => String(it.id));
}

/** Fetch memories by id, a few at a time, in order. Missing ones are left out. */
async function fetchMemories(this: IExecuteFunctions, ids: string[]): Promise<IDataObject[]> {
	const found: Array<IDataObject | undefined> = new Array(ids.length);
	let next = 0;
	const worker = async () => {
		while (next < ids.length) {
			const index = next++;
			try {
				const memory = await penfieldApiRequest.call(this, 'GET', `/memories/${ids[index]}`);
				found[index] = memory && typeof memory === 'object' ? memory : undefined;
			} catch {
				found[index] = undefined;
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, ids.length) }, worker));
	return found.filter((m): m is IDataObject => m !== undefined);
}

/** One memory for the output: content capped, metadata flattened. */
export function memoryView(memory: IDataObject, maxChars = RESULT_CONTENT_MAX_CHARS): IDataObject {
	const meta = (
		memory.metadata && typeof memory.metadata === 'object' ? memory.metadata : {}
	) as IDataObject;
	const field = (name: string) => (memory[name] !== undefined ? memory[name] : meta[name]);
	const isDocument = memory.source_type === 'document_upload';
	const content = String(
		(isDocument ? memory.content_with_context : undefined) ??
			memory.content ??
			memory.snippet ??
			'',
	);
	const view: IDataObject = {
		id: memory.id,
		content: maxChars ? Array.from(content).slice(0, maxChars).join('') : content,
		memory_type: field('memory_type'),
		importance: field('importance'),
		tags: (field('tags') as string[] | undefined) ?? [],
		created_at: field('created_at'),
	};
	if (memory.score !== undefined) view.score = memory.score;
	if (maxChars && charCount(content) > maxChars) view.truncated = true;
	return view;
}

export async function saveContext(
	this: IExecuteFunctions,
	name: string,
	description: string,
): Promise<IDataObject> {
	for (const { saved } of await allCheckpoints.call(this)) {
		if (saved.checkpoint_name === name) {
			return {
				success: false,
				error: `Context name '${name}' already exists. Use a unique name.`,
				error_code: 'DUPLICATE_NAME',
			};
		}
	}

	// The memories the description is about. A description too short to
	// search on, or a failed search, links the most recent memories.
	let memoryIds: string[] = [];
	let searched = false;
	if (description.split(/\s+/).filter(Boolean).length >= MIN_QUERY_WORDS) {
		try {
			memoryIds = await matchingIds.call(this, Array.from(description).slice(0, 200).join(''), 30);
			searched = true;
		} catch {
			searched = false;
		}
	}
	if (!searched) {
		const recent = await penfieldApiRequest.call(this, 'GET', '/memories', undefined, {
			sort: '-created_at',
			per_page: RECENT_FALLBACK,
		});
		memoryIds = ((recent?.items as IDataObject[]) ?? [])
			.filter((m) => m?.id)
			.map((m) => String(m.id));
	}

	// References written into the description.
	const uuidRefs = [...description.matchAll(MEMORY_ID_REF)].map((m) => m[1].toLowerCase());
	const phraseRefs = [...description.matchAll(MEMORY_PHRASE_REF)].map((m) => m[1]);
	const uniqueUuids = [...new Set(uuidRefs)];
	const seen = new Set(memoryIds);
	const referenced: string[] = [];
	const unresolved: string[] = [];
	const existing = new Set(
		(
			await fetchMemories.call(
				this,
				uniqueUuids.filter((u) => UUID_RE.test(u)),
			)
		).map((m) => String(m.id)),
	);
	for (const id of uniqueUuids) {
		if (!existing.has(id)) unresolved.push(`memory_id: ${id}`);
		else if (!seen.has(id)) {
			seen.add(id);
			referenced.push(id);
		}
	}
	for (const phrase of [...new Set(phraseRefs)]) {
		let match: string[] = [];
		try {
			match = await matchingIds.call(this, phrase, 1);
		} catch {
			match = [];
		}
		if (!match.length) unresolved.push(`memory: '${phrase}'`);
		else if (!seen.has(match[0])) {
			seen.add(match[0]);
			referenced.push(match[0]);
		}
	}
	const extracted = new Set(uuidRefs).size + new Set(phraseRefs).size;

	const content = JSON.stringify({
		checkpoint_name: name,
		description,
		memory_count: memoryIds.length,
		memory_ids: memoryIds,
		referenced_memories: referenced,
	});
	const created = await penfieldApiRequest.call(this, 'POST', '/memories', {
		content,
		memory_type: 'checkpoint',
		importance: 0.9,
		tags: ['checkpoint', 'context', ...(tagProblem(name) ? [] : [name])],
		// Penfield's MCP server looks here to see whether a name is taken. No
		// source_type: Penfield sets it, as for the MCP server's own checkpoints.
		// Matches hermes-penfield 0.3.3.
		metadata: { checkpoint_name: name },
	});
	return {
		success: true,
		message: `Context '${name}' saved`,
		context_id: created?.id,
		name,
		memories_included: memoryIds.length,
		memory_ids: memoryIds,
		references_extracted: extracted,
		references_resolved: extracted - unresolved.length,
		unresolved_references: unresolved,
		referenced_memories: referenced,
	};
}

export async function listContexts(
	this: IExecuteFunctions,
	options: { limit: number; offset: number; namePattern: string; includeDescriptions: boolean },
): Promise<IDataObject> {
	const pattern = options.namePattern.toLowerCase();
	const matches: IDataObject[] = [];
	for (const { memory, saved } of await allCheckpoints.call(this)) {
		const name = String(saved.checkpoint_name ?? String(memory.content ?? '').slice(0, 100));
		if (pattern && !name.toLowerCase().includes(pattern)) continue;
		const context: IDataObject = {
			id: memory.id,
			name,
			memory_count: saved.memory_count ?? 0,
			created: memory.created_at,
		};
		if (options.includeDescriptions) context.description = saved.description ?? memory.content;
		matches.push(context);
	}
	const page = matches.slice(options.offset, options.offset + options.limit);
	return {
		contexts: page,
		total: matches.length,
		limit: options.limit,
		offset: options.offset,
		has_more: matches.length > options.offset + page.length,
	};
}

async function findCheckpoint(
	this: IExecuteFunctions,
	name: string,
): Promise<IDataObject | undefined> {
	if (UUID_RE.test(name)) {
		let found: IDataObject | undefined;
		try {
			found = await penfieldApiRequest.call(this, 'GET', `/memories/${name}`);
		} catch (error) {
			if (String((error as { httpCode?: string }).httpCode) !== '404') {
				throw new NodeApiError(this.getNode(), error as JsonObject);
			}
		}
		if (found?.memory_type === 'checkpoint') return found;
	}
	for (const { memory, saved } of await allCheckpoints.call(this)) {
		if (saved.checkpoint_name === name) return memory;
	}
	return undefined;
}

export async function restoreContext(
	this: IExecuteFunctions,
	name: string,
	limit: number,
): Promise<IDataObject> {
	if (name.toLowerCase() === 'awakening') {
		const data = await penfieldApiRequest.call(this, 'GET', '/personality/awakening');
		return { name: 'awakening', briefing: data?.briefing ?? '' };
	}
	const checkpoint = await findCheckpoint.call(this, name);
	if (!checkpoint) return { success: false, error: `No checkpoint found with name '${name}'` };
	const saved = checkpointPayload(checkpoint);
	const ids = [
		...new Set([
			...((saved.memory_ids as string[]) ?? []).map(String),
			...((saved.referenced_memories as string[]) ?? []).map(String),
		]),
	];
	const memories = (await fetchMemories.call(this, ids.slice(0, limit))).map((m) => memoryView(m));
	return {
		success: true,
		context_id: checkpoint.id,
		name: saved.checkpoint_name ?? name,
		description: saved.description ?? checkpoint.content,
		memories,
		count: memories.length,
		saved_count: ids.length,
		truncated: ids.length > limit,
	};
}
