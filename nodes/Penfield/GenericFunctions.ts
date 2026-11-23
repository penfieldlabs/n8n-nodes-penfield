import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

export const BASE_URL = 'https://api.penfield.app/api/v2';

/** Length in characters (Unicode code points), as Penfield counts it, not UTF-16 units. */
export function charCount(text: string): number {
	return Array.from(text).length;
}

export const MAX_CONTENT_LENGTH = 10000;
export const MAX_QUERY_LENGTH = 4000;
export const MAX_TAGS = 10;
export const MAX_ARTIFACT_BYTES = 1048576;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ARTIFACT_PATH_RE = /^\/[A-Za-z0-9._\-/]+$/;

type Context = IExecuteFunctions | ILoadOptionsFunctions;

interface PenfieldErrorBody {
	error?: { code?: string; message?: string; field_errors?: Record<string, string[]> | null };
}

/** The credential the node is set to use: a Penfield sign-in or an API key. */
export function credentialType(this: Context): 'penfieldOAuth2Api' | 'penfieldApi' {
	const authentication =
		'getInputData' in this
			? this.getNodeParameter('authentication', 0, 'apiKey')
			: this.getNodeParameter('authentication', 'apiKey');
	return authentication === 'oAuth2' ? 'penfieldOAuth2Api' : 'penfieldApi';
}

/**
 * Calls the Penfield API and returns the `data` field of its response
 * envelope. Penfield answers 204 with no body on deletes; that returns
 * `undefined`.
 */
export async function penfieldApiRequest(
	this: Context,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject,
	qs?: IDataObject,
): Promise<IDataObject | undefined> {
	const options: IHttpRequestOptions = {
		method,
		url: `${BASE_URL}${endpoint}`,
		json: true,
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
	};
	if (body && Object.keys(body).length) options.body = body;
	if (qs) {
		const clean = Object.fromEntries(
			Object.entries(qs).filter(([, v]) => v !== undefined && v !== '' && v !== null),
		);
		if (Object.keys(clean).length) options.qs = clean;
	}

	let response: IDataObject | string | undefined;
	try {
		response = (await this.helpers.httpRequestWithAuthentication.call(
			this,
			credentialType.call(this),
			options,
		)) as IDataObject | string | undefined;
	} catch (error) {
		throw toApiError.call(this, error as JsonObject);
	}
	if (response === undefined || response === null || response === '') return undefined;
	if (typeof response !== 'object') {
		throw new NodeOperationError(this.getNode(), 'Penfield returned a response that is not JSON');
	}
	return (response.data as IDataObject | undefined) ?? response;
}

function parsePenfieldBody(raw: unknown): PenfieldErrorBody['error'] | undefined {
	let value = raw;
	if (typeof value === 'string') {
		try {
			value = JSON.parse(value) as unknown;
		} catch {
			return undefined;
		}
	}
	if (value && typeof value === 'object' && 'error' in value) {
		const inner = (value as PenfieldErrorBody).error;
		if (inner && typeof inner === 'object' && (inner.message || inner.code)) return inner;
	}
	return undefined;
}

/** Find Penfield's error envelope wherever the HTTP client put the body. */
function findPenfieldError(error: JsonObject): PenfieldErrorBody['error'] | undefined {
	const e = error as unknown as Record<string, unknown> & {
		context?: { data?: unknown };
		cause?: { response?: { data?: unknown; body?: unknown }; error?: unknown };
		response?: { data?: unknown; body?: unknown };
	};
	const candidates = [
		e.context?.data,
		e.cause?.response?.data,
		e.cause?.response?.body,
		e.cause?.error,
		e.response?.data,
		e.response?.body,
		e.error,
		e.description,
	];
	for (const candidate of candidates) {
		const found = parsePenfieldBody(candidate);
		if (found) return found;
	}
	return undefined;
}

function toApiError(this: Context, error: JsonObject): NodeApiError {
	const penfield = findPenfieldError(error);
	const status = (error.httpCode ??
		(error as { response?: { status?: number } }).response?.status ??
		(error as { cause?: { response?: { status?: number } } }).cause?.response?.status) as
		| number
		| string
		| undefined;

	let message = penfield?.message;
	if (message && String(status) === '403') {
		message = `${message}. Check that the API key has the permission this operation needs (read, write or delete).`;
	}
	const parts: string[] = [];
	if (penfield?.code) parts.push(`Penfield error code: ${penfield.code}`);
	if (penfield?.field_errors && typeof penfield.field_errors === 'object') {
		for (const [field, msgs] of Object.entries(penfield.field_errors)) {
			parts.push(`${field}: ${(msgs ?? []).join('; ')}`);
		}
	}
	const description = parts.length ? parts.join('. ') : undefined;

	// n8n's request helper already throws a NodeApiError, and wrapping one
	// returns it unchanged, so put Penfield's own message on it directly.
	if (error instanceof NodeApiError) {
		if (message) error.message = message;
		if (description) error.description = description;
		return error;
	}
	return new NodeApiError(this.getNode(), error, {
		message,
		description,
		httpCode: status !== undefined ? String(status) : undefined,
	});
}

/** Fetch every page of a paginated list endpoint, stopping at `limit` when given. */
export async function penfieldApiRequestAllItems(
	this: IExecuteFunctions,
	endpoint: string,
	qs: IDataObject,
	limit?: number,
): Promise<IDataObject[]> {
	const results: IDataObject[] = [];
	const perPage = limit !== undefined ? Math.min(Math.max(limit, 1), 100) : 100;
	let page = 1;
	for (;;) {
		const data = await penfieldApiRequest.call(this, 'GET', endpoint, undefined, {
			...qs,
			page,
			per_page: perPage,
		});
		const items = ((data?.items as IDataObject[]) ?? []).filter(Boolean);
		results.push(...items);
		const pagination = (data?.pagination ?? {}) as IDataObject;
		if (limit !== undefined && results.length >= limit) return results.slice(0, limit);
		if (!pagination.has_next || items.length === 0) return results;
		page += 1;
	}
}

export function requireUuid(
	this: Context,
	value: unknown,
	label: string,
	itemIndex: number,
): string {
	const id = String(value ?? '').trim();
	if (!UUID_RE.test(id)) {
		throw new NodeOperationError(this.getNode(), `${label} must be a memory ID (a UUID)`, {
			itemIndex,
			description: `Got "${id}". Pick the memory from the list, or paste its ID.`,
		});
	}
	return id;
}

export function requireContent(
	this: Context,
	value: unknown,
	itemIndex: number,
	required = true,
): string | undefined {
	const content = String(value ?? '').trim();
	if (!content) {
		if (!required) return undefined;
		throw new NodeOperationError(this.getNode(), 'Content is required', { itemIndex });
	}
	const length = charCount(content);
	if (length > MAX_CONTENT_LENGTH) {
		throw new NodeOperationError(
			this.getNode(),
			`Content is ${length.toLocaleString('en-US')} characters. A memory holds at most ${MAX_CONTENT_LENGTH.toLocaleString('en-US')}.`,
			{
				itemIndex,
				description: 'Split the text into several memories, or save it as an artifact.',
			},
		);
	}
	return content;
}

export const TAG_MIN_CHARS = 2;
export const TAG_MAX_CHARS = 50;

/** A tag the way Penfield stores it: lower case, hyphens, only a-z, 0-9 and -. */
export function storedTag(tag: string): string {
	return tag
		.trim()
		.toLowerCase()
		.replace(/[ _]/g, '-')
		.replace(/[^a-z0-9-]/g, '')
		.replace(/-{2,}/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** Why Penfield would not store `tag`, or undefined if it would. */
export function tagProblem(tag: string): string | undefined {
	const kept = storedTag(tag).length;
	if (kept > TAG_MAX_CHARS) {
		return `is too long: ${kept} characters, and a tag can have at most ${TAG_MAX_CHARS}`;
	}
	if (kept < TAG_MIN_CHARS) {
		return `would not be stored: a tag keeps its letters a to z, its digits and its hyphens, and at least ${TAG_MIN_CHARS} characters have to remain`;
	}
	return undefined;
}

/**
 * Tags from a list or comma-separated text. For a write (`forWrite`), a tag
 * Penfield would not store is refused here, before any request, so the
 * error names it.
 */
export function parseTags(
	this: Context,
	value: unknown,
	itemIndex: number,
	forWrite = false,
): string[] | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const list = Array.isArray(value) ? value : String(value).split(',');
	const tags = list.map((t) => String(t).trim()).filter((t) => t.length > 0);
	if (forWrite) {
		tags.forEach((tag, index) => {
			const problem = tagProblem(tag);
			if (problem) {
				const shown = tag.length <= 20 ? tag : `${tag.slice(0, 20)}...`;
				throw new NodeOperationError(this.getNode(), `Tag ${index + 1} ("${shown}") ${problem}`, {
					itemIndex,
				});
			}
		});
	}
	if (tags.length > MAX_TAGS) {
		throw new NodeOperationError(
			this.getNode(),
			`A memory can have at most ${MAX_TAGS} tags (got ${tags.length})`,
			{ itemIndex },
		);
	}
	return tags;
}

export function requireArtifactPath(this: Context, value: unknown, itemIndex: number): string {
	const path = String(value ?? '').trim();
	const problem = artifactPathProblem(path);
	if (problem) {
		throw new NodeOperationError(this.getNode(), `Invalid artifact path: ${problem}`, {
			itemIndex,
			description: 'Use a path such as /project/notes/meeting.md',
		});
	}
	return path;
}

export function artifactPathProblem(path: string): string | undefined {
	if (!path.startsWith('/')) return 'it must start with /';
	if (path.endsWith('/')) return 'it must end with a file name, not a folder';
	if (!ARTIFACT_PATH_RE.test(path))
		return 'only letters, digits, dash, underscore, dot and slash are allowed';
	if (path.includes('//')) return 'it must not contain //';
	const parts = path.split('/').slice(1);
	if (parts.some((p) => p === '..' || p === '.')) return 'it must not contain . or .. segments';
	if (parts.some((p) => p.startsWith('.'))) return 'hidden files and folders are not allowed';
	if (parts.length - 1 > 10) return 'it can be at most 10 folders deep';
	return undefined;
}

export function requireFolder(this: Context, value: unknown, itemIndex: number): string {
	let folder = String(value ?? '').trim() || '/';
	if (!folder.startsWith('/')) folder = `/${folder}`;
	if (folder.length > 1 && folder.endsWith('/')) folder = folder.slice(0, -1);
	if (folder !== '/' && artifactPathProblem(folder)) {
		throw new NodeOperationError(this.getNode(), `Invalid folder: ${artifactPathProblem(folder)}`, {
			itemIndex,
		});
	}
	return folder;
}

const SIMPLE_MEMORY_FIELDS = [
	'id',
	'content',
	'memory_type',
	'importance',
	'confidence',
	'tags',
	'source_type',
	'created_at',
	'updated_at',
] as const;

/** At most 10 of the most useful memory fields, as the n8n UX guidelines ask. */
export function simplifyMemory(memory: IDataObject): IDataObject {
	const out: IDataObject = {};
	for (const key of SIMPLE_MEMORY_FIELDS) {
		if (memory[key] !== undefined) out[key] = memory[key];
	}
	return out;
}

/** Flatten one hybrid search hit. */
export function simplifySearchResult(item: IDataObject): IDataObject {
	const metadata = (item.metadata ?? {}) as IDataObject;
	return {
		id: item.id,
		content: item.content_with_context ?? item.content,
		score: item.score,
		memory_type: metadata.memory_type,
		importance: metadata.importance,
		source_type: item.source_type,
		tags: item.tags,
		created_at: item.created_at,
	};
}
