import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	charCount,
	MAX_ARTIFACT_BYTES,
	MAX_CONTENT_LENGTH,
	MAX_QUERY_LENGTH,
	parseTags,
	penfieldApiRequest,
	penfieldApiRequestAllItems,
	requireArtifactPath,
	requireContent,
	requireFolder,
	requireUuid,
	simplifyMemory,
	simplifySearchResult,
} from './GenericFunctions';
import { listContexts, restoreContext, saveContext } from './ContextFunctions';
import { artifactFields, artifactOperations } from './descriptions/ArtifactDescription';
import { contextFields, contextOperations } from './descriptions/ContextDescription';
import { memoryFields, memoryOperations } from './descriptions/MemoryDescription';
import { personalityOperations } from './descriptions/PersonalityDescription';
import { relationshipFields, relationshipOperations } from './descriptions/RelationshipDescription';

/*
 * Programmatic rather than declarative style: every operation validates its
 * input against Penfield's limits before the request (memory IDs, the 10,000
 * character limit, artifact path rules, tag count), unwraps Penfield's
 * response envelope, turns its error envelope into a readable NodeApiError,
 * pages through list endpoints and shapes Simplify and Delete output. Doing
 * that with routing hooks would need a custom function on nearly every
 * operation.
 */
export class Penfield implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Penfield',
		name: 'penfield',
		icon: { light: 'file:penfield.svg', dark: 'file:penfield.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Long-term memory and a knowledge graph for AI agents and workflows',
		defaults: { name: 'Penfield' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'penfieldOAuth2Api',
				required: true,
				displayOptions: { show: { authentication: ['oAuth2'] } },
			},
			{
				name: 'penfieldApi',
				required: true,
				displayOptions: { show: { authentication: ['apiKey'] } },
			},
		],
		properties: [
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				options: [
					{
						name: 'API Key',
						value: 'apiKey',
						description: 'For servers nobody signs in from, or to limit the node to read-only',
					},
					{
						name: 'Sign In With Penfield',
						value: 'oAuth2',
						description: 'Sign in with your Penfield account. Needs n8n 1.119 or later.',
					},
				],
				default: 'oAuth2',
			},
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Artifact', value: 'artifact' },
					{ name: 'Context', value: 'context' },
					{ name: 'Memory', value: 'memory' },
					{ name: 'Personality', value: 'personality' },
					{ name: 'Relationship', value: 'relationship' },
				],
				default: 'memory',
			},
			...memoryOperations,
			...memoryFields,
			...relationshipOperations,
			...relationshipFields,
			...artifactOperations,
			...artifactFields,
			...contextOperations,
			...contextFields,
			...personalityOperations,
		],
	};

	methods = {
		listSearch: {
			async searchMemories(
				this: ILoadOptionsFunctions,
				filter?: string,
			): Promise<INodeListSearchResult> {
				const label = (content: unknown) => {
					const text = String(content ?? '')
						.replace(/\s+/g, ' ')
						.trim();
					return text.length > 80 ? `${text.slice(0, 77)}...` : text || '(empty)';
				};
				const query = (filter ?? '').trim();
				let memories: IDataObject[];
				if (query) {
					const data = await penfieldApiRequest.call(this, 'POST', '/search/hybrid', {
						query: query.slice(0, MAX_QUERY_LENGTH),
						limit: 20,
						source_types: ['direct_input', 'conversation', 'api_import', 'checkpoint'],
					});
					memories = (data?.items as IDataObject[]) ?? [];
				} else {
					const data = await penfieldApiRequest.call(this, 'GET', '/memories', undefined, {
						per_page: 50,
						sort: '-created_at',
					});
					memories = (data?.items as IDataObject[]) ?? [];
				}
				return {
					results: memories.map((m) => ({ name: label(m.content), value: String(m.id) })),
				};
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				let output: IDataObject | IDataObject[];

				if (resource === 'memory') {
					output = await executeMemory.call(this, operation, i);
				} else if (resource === 'relationship') {
					output = await executeRelationship.call(this, operation, i);
				} else if (resource === 'artifact') {
					output = await executeArtifact.call(this, operation, i);
				} else if (resource === 'context') {
					output = await executeContext.call(this, operation, i);
				} else if (resource === 'personality') {
					const data = await penfieldApiRequest.call(this, 'GET', '/personality/awakening');
					output = { briefing: data?.briefing ?? '' };
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown resource "${resource}"`, {
						itemIndex: i,
					});
				}

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(output),
					{ itemData: { item: i } },
				);
				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				// Errors from GenericFunctions are already NodeApiError (API failures)
				// or NodeOperationError (invalid input). Keep them as they are, with
				// the item index; wrap anything else.
				const nodeError =
					error instanceof NodeApiError || error instanceof NodeOperationError ? error : undefined;
				if (nodeError) {
					if (nodeError.context.itemIndex === undefined) nodeError.context.itemIndex = i;
					throw nodeError;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}

const SEARCH_SOURCES: Record<string, string[] | undefined> = {
	all: undefined,
	memories: ['direct_input', 'conversation', 'api_import', 'checkpoint'],
	documents: ['document_upload'],
};

/** `search` ranks by meaning: the weights Penfield's reference REST client uses. */
const SEMANTIC_SEARCH_WEIGHTS = { bm25_weight: 0.1, vector_weight: 0.7, graph_weight: 0.2 };

/** Reflect windows the API does not know by name, sent as a start date. */
const REFLECT_DAY_WINDOWS: Record<string, number> = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 };

function toIsoDate(value: unknown): string | undefined {
	if (!value) return undefined;
	const date = new Date(String(value));
	return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

async function executeMemory(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	const simplify = () => this.getNodeParameter('simplify', i, true) as boolean;
	const memoryId = () =>
		requireUuid.call(
			this,
			this.getNodeParameter('memoryId', i, '', { extractValue: true }),
			'Memory',
			i,
		);

	switch (operation) {
		case 'create': {
			const fields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
			const body: IDataObject = {
				content: requireContent.call(this, this.getNodeParameter('content', i), i),
			};
			if (fields.memoryType) body.memory_type = fields.memoryType;
			if (fields.importance !== undefined) body.importance = fields.importance;
			if (fields.confidence !== undefined) body.confidence = fields.confidence;
			const tags = parseTags.call(this, fields.tags, i, true);
			if (tags?.length) body.tags = tags;
			const memory = (await penfieldApiRequest.call(this, 'POST', '/memories', body)) ?? {};
			return simplify() ? simplifyMemory(memory) : memory;
		}
		case 'get': {
			const memory = (await penfieldApiRequest.call(this, 'GET', `/memories/${memoryId()}`)) ?? {};
			return simplify() ? simplifyMemory(memory) : memory;
		}
		case 'update': {
			const id = memoryId();
			const fields = this.getNodeParameter('updateFields', i, {}) as IDataObject;
			const body: IDataObject = {};
			if (fields.content !== undefined) {
				body.content = requireContent.call(this, fields.content, i);
			}
			if (fields.memoryType) body.memory_type = fields.memoryType;
			if (fields.importance !== undefined) body.importance = fields.importance;
			if (fields.confidence !== undefined) body.confidence = fields.confidence;
			if (fields.tags !== undefined) body.tags = parseTags.call(this, fields.tags, i, true) ?? [];
			if (!Object.keys(body).length) {
				throw new NodeOperationError(this.getNode(), 'Add at least one field to update', {
					itemIndex: i,
				});
			}
			const memory = (await penfieldApiRequest.call(this, 'PUT', `/memories/${id}`, body)) ?? {};
			return simplify() ? simplifyMemory(memory) : memory;
		}
		case 'delete': {
			await penfieldApiRequest.call(this, 'DELETE', `/memories/${memoryId()}`);
			return { deleted: true };
		}
		case 'getAll': {
			const returnAll = this.getNodeParameter('returnAll', i) as boolean;
			const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
			const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
			const sort = this.getNodeParameter('sort', i, {}) as IDataObject;
			const tags = parseTags.call(this, filters.tags, i);
			const sortField = (sort.field as string) ?? 'created_at';
			const qs: IDataObject = {
				memory_type: filters.memoryType,
				importance_threshold: filters.importanceThreshold,
				time_range: filters.timeRange,
				date_from: toIsoDate(filters.dateFrom),
				date_to: toIsoDate(filters.dateTo),
				tags: tags?.join(','),
				include_inactive: filters.includeInactive ? true : undefined,
				sort: (sort.direction ?? 'desc') === 'desc' ? `-${sortField}` : sortField,
			};
			const memories = await penfieldApiRequestAllItems.call(this, '/memories', qs, limit);
			return simplify() ? memories.map(simplifyMemory) : memories;
		}
		case 'search': {
			const query = String(this.getNodeParameter('query', i) ?? '').trim();
			if (!query) {
				throw new NodeOperationError(this.getNode(), 'Query is required', { itemIndex: i });
			}
			if (charCount(query) > MAX_QUERY_LENGTH) {
				throw new NodeOperationError(
					this.getNode(),
					`Query is ${charCount(query)} characters. The maximum is ${MAX_QUERY_LENGTH}.`,
					{ itemIndex: i },
				);
			}
			const filters = this.getNodeParameter('searchFilters', i, {}) as IDataObject;
			const body: IDataObject = {
				query,
				limit: this.getNodeParameter('limit', i, 10) as number,
			};
			if ((this.getNodeParameter('searchMode', i, 'hybrid') as string) === 'semantic') {
				Object.assign(body, SEMANTIC_SEARCH_WEIGHTS);
			}
			const memoriesOnly = filters.source === 'memories';
			const sources = SEARCH_SOURCES[(filters.source as string) ?? 'all'];
			if (sources) body.source_types = sources;
			const memoryTypes = filters.memoryTypes as string[] | undefined;
			if (memoryTypes?.length) body.memory_types = memoryTypes;
			if (filters.importanceThreshold !== undefined) {
				body.importance_threshold = filters.importanceThreshold;
			}
			const tags = parseTags.call(this, filters.tags, i);
			if (tags?.length) body.tags = tags.join(',');
			if (filters.startDate) body.start_date = toIsoDate(filters.startDate);
			if (filters.endDate) body.end_date = toIsoDate(filters.endDate);
			const data = await penfieldApiRequest.call(this, 'POST', '/search/hybrid', body);
			let results = (data?.items as IDataObject[]) ?? [];
			if (!results.length && memoriesOnly) {
				// An empty answer can also mean the API stopped accepting one of
				// the source types sent. Search again without them, leaving
				// documents out.
				const wanted = body.limit as number;
				const retry: IDataObject = { ...body, limit: Math.min(wanted * 3, 100) };
				delete retry.source_types;
				const again = await penfieldApiRequest.call(this, 'POST', '/search/hybrid', retry);
				results = ((again?.items as IDataObject[]) ?? [])
					.filter((it) => it.source_type !== 'document_upload')
					.slice(0, wanted);
			}
			return simplify() ? results.map(simplifySearchResult) : results;
		}
		case 'reflect': {
			const window = this.getNodeParameter('timeWindow', i, 'recent') as string;
			const options = this.getNodeParameter('reflectOptions', i, {}) as IDataObject;
			const body: IDataObject = { include_documents: Boolean(options.includeDocuments) };
			if (options.startDate) body.start_date = toIsoDate(options.startDate);
			if (options.endDate) body.end_date = toIsoDate(options.endDate);
			const days = REFLECT_DAY_WINDOWS[window];
			if (days === undefined) {
				body.time_window = window;
			} else if (!body.start_date && !body.end_date) {
				// Explicit dates override the window, so only fill in a missing start.
				body.start_date = new Date(Date.now() - days * 86_400_000).toISOString();
			}
			const data = (await penfieldApiRequest.call(this, 'POST', '/analysis/reflect', body)) ?? {};
			if (!simplify()) return data;
			const stats = (data.statistics ?? {}) as IDataObject;
			const memories = ((data.memories as IDataObject[]) ?? []).map((m) => ({
				id: m.id,
				content: m.content,
				memory_type: m.memory_type,
				importance: m.importance,
				created_at: m.created_at,
			}));
			return {
				time_window: data.time_window,
				memories_analyzed: stats.total_memories_analyzed,
				active_topics: data.active_topics ?? [],
				memories,
				emerging_patterns: data.emerging_patterns ?? [],
				contexts: data.contexts ?? [],
			};
		}
		default:
			throw new NodeOperationError(this.getNode(), `Unknown operation "${operation}"`, {
				itemIndex: i,
			});
	}
}

async function executeRelationship(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	const locator = (name: string, label: string) =>
		requireUuid.call(this, this.getNodeParameter(name, i, '', { extractValue: true }), label, i);

	switch (operation) {
		case 'create': {
			const fromId = locator('fromMemoryId', 'From Memory');
			const toId = locator('toMemoryId', 'To Memory');
			if (fromId === toId) {
				throw new NodeOperationError(this.getNode(), 'A memory cannot be linked to itself', {
					itemIndex: i,
				});
			}
			const fields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
			const body: IDataObject = {
				from_id: fromId,
				to_id: toId,
				relationship_type: this.getNodeParameter('relationshipType', i) as string,
			};
			if (fields.strength !== undefined) body.strength = fields.strength;
			if (fields.confidence !== undefined) body.confidence = fields.confidence;
			if (fields.reason) body.evidence = { reason: fields.reason, source: 'n8n' };
			return (await penfieldApiRequest.call(this, 'POST', '/relationships', body)) ?? {};
		}
		case 'delete': {
			const fromId = locator('fromMemoryId', 'From Memory');
			const toId = locator('toMemoryId', 'To Memory');
			await penfieldApiRequest.call(this, 'DELETE', '/relationships/between', undefined, {
				from_id: fromId,
				to_id: toId,
			});
			return { deleted: true };
		}
		case 'getAll': {
			const memoryId = locator('memoryId', 'Memory');
			const returnAll = this.getNodeParameter('returnAll', i) as boolean;
			const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
			const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
			const direction = (filters.direction as string) ?? 'any';
			const qs: IDataObject = { relationship_type: filters.relationshipType };
			if (direction === 'outgoing') qs.from_id = memoryId;
			else if (direction === 'incoming') qs.to_id = memoryId;
			else qs.memory_id = memoryId;
			return await penfieldApiRequestAllItems.call(this, '/relationships', qs, limit);
		}
		case 'explore': {
			const memoryId = locator('memoryId', 'Memory');
			const options = this.getNodeParameter('exploreOptions', i, {}) as IDataObject;
			const body: IDataObject = {
				start_memory_id: memoryId,
				max_depth: this.getNodeParameter('maxDepth', i, 2) as number,
				direction: (options.direction as string) ?? 'ANY',
			};
			const types = options.relationshipTypes as string[] | undefined;
			if (types?.length) body.relationship_types = types;
			const data =
				(await penfieldApiRequest.call(this, 'POST', '/relationships/traverse', body)) ?? {};
			const nodes = (data.node_details ?? {}) as Record<string, IDataObject>;
			const rels = (data.relationship_details ?? {}) as Record<string, IDataObject>;
			return {
				start_memory_id: memoryId,
				total_paths_found: data.total_paths_found,
				memories: Object.entries(nodes).map(([id, n]) => ({
					id,
					preview: n.preview,
					memory_type: n.type,
					importance: n.importance,
					tags: n.tags,
				})),
				relationships: Object.entries(rels).map(([id, r]) => ({
					id,
					from_id: r.from_id,
					to_id: r.to_id,
					relationship_type: r.type,
					strength: r.strength,
				})),
			};
		}
		default:
			throw new NodeOperationError(this.getNode(), `Unknown operation "${operation}"`, {
				itemIndex: i,
			});
	}
}

async function executeArtifact(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'create': {
			const path = requireArtifactPath.call(this, this.getNodeParameter('path', i), i);
			const content = String(this.getNodeParameter('content', i) ?? '');
			if (!content) {
				throw new NodeOperationError(this.getNode(), 'Content is required', { itemIndex: i });
			}
			const bytes = new TextEncoder().encode(content).length;
			if (bytes > MAX_ARTIFACT_BYTES) {
				throw new NodeOperationError(
					this.getNode(),
					`Content is ${bytes} bytes. An artifact holds at most 1 MB (${MAX_ARTIFACT_BYTES} bytes).`,
					{ itemIndex: i },
				);
			}
			const data =
				(await penfieldApiRequest.call(this, 'POST', '/artifacts', { path, content })) ?? {};
			return {
				path: data.path ?? path,
				artifact_id: data.artifact_id,
				content_type: data.content_type,
				size: data.size,
			};
		}
		case 'get': {
			const path = requireArtifactPath.call(this, this.getNodeParameter('path', i), i);
			const data =
				(await penfieldApiRequest.call(this, 'GET', '/artifacts', undefined, { path })) ?? {};
			return {
				path: data.path ?? path,
				content: data.content,
				content_type: data.content_type,
				size: data.size,
			};
		}
		case 'delete': {
			const path = requireArtifactPath.call(this, this.getNodeParameter('path', i), i);
			await penfieldApiRequest.call(this, 'DELETE', '/artifacts', undefined, { path });
			return { deleted: true };
		}
		case 'getAll': {
			const folder = requireFolder.call(this, this.getNodeParameter('folder', i, '/'), i);
			const options = this.getNodeParameter('listOptions', i, {}) as IDataObject;
			const data =
				(await penfieldApiRequest.call(this, 'GET', '/artifacts/list', undefined, {
					prefix: folder,
					name_pattern: options.namePattern,
				})) ?? {};
			const base = folder === '/' ? '' : folder;
			const folders = ((data.folders as string[]) ?? []).map((name) => ({
				type: 'folder',
				name,
				path: `${base}/${name}`,
			}));
			const files = ((data.files as IDataObject[]) ?? []).map((f) => ({
				type: 'file',
				name: f.name,
				path: `${base}/${String(f.name)}`,
				size: f.size,
				content_type: f.content_type,
				last_modified: f.last_modified,
			}));
			return [...folders, ...files];
		}
		default:
			throw new NodeOperationError(this.getNode(), `Unknown operation "${operation}"`, {
				itemIndex: i,
			});
	}
}

async function executeContext(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'save': {
			const name = String(this.getNodeParameter('name', i) ?? '').trim();
			if (!name) throw new NodeOperationError(this.getNode(), 'Name is required', { itemIndex: i });
			if (charCount(name) > 200) {
				throw new NodeOperationError(this.getNode(), 'Name can be at most 200 characters', {
					itemIndex: i,
				});
			}
			const description = String(this.getNodeParameter('description', i, '') ?? '').trim();
			if (charCount(description) > MAX_CONTENT_LENGTH) {
				throw new NodeOperationError(
					this.getNode(),
					`Description is ${charCount(description)} characters. The maximum is ${MAX_CONTENT_LENGTH}.`,
					{ itemIndex: i },
				);
			}
			const saved = await saveContext.call(this, name, description);
			if (saved.success === false) {
				// Nothing was saved, so the node fails: On Error, Retry On Fail and
				// error workflows then apply, as for any other failed operation.
				throw new NodeOperationError(this.getNode(), String(saved.error), {
					itemIndex: i,
					description:
						'Checkpoint names are unique in a Penfield account. Choose another name, for example with a date or run ID in it.',
				});
			}
			return saved;
		}
		case 'restore': {
			const name = String(this.getNodeParameter('name', i) ?? '').trim();
			if (!name) {
				throw new NodeOperationError(this.getNode(), 'Name or ID is required', { itemIndex: i });
			}
			const restored = await restoreContext.call(
				this,
				name,
				this.getNodeParameter('maxMemories', i, 20) as number,
			);
			if (restored.success === false) {
				throw new NodeOperationError(this.getNode(), String(restored.error), {
					itemIndex: i,
					description:
						'Names are matched exactly, including upper and lower case. Context > Get Many lists the saved names.',
				});
			}
			return restored;
		}
		case 'getAll': {
			const options = this.getNodeParameter('contextOptions', i, {}) as IDataObject;
			return await listContexts.call(this, {
				limit: this.getNodeParameter('limit', i, 50) as number,
				offset: Number(options.offset ?? 0),
				namePattern: String(options.namePattern ?? ''),
				includeDescriptions: Boolean(options.includeDescriptions),
			});
		}
		default:
			throw new NodeOperationError(this.getNode(), `Unknown operation "${operation}"`, {
				itemIndex: i,
			});
	}
}
