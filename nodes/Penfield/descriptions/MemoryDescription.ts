import type { INodeProperties } from 'n8n-workflow';
import { MEMORY_TYPES, memoryLocator, returnAllAndLimit, simplifyField } from './shared';

const show = (operation: string[]) => ({ resource: ['memory'], operation });

export const memoryOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['memory'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Save a new piece of knowledge to long-term memory',
				action: 'Create memory',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Permanently delete a memory and its relationships',
				action: 'Delete memory',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Retrieve one memory by its ID',
				action: 'Get memory',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List memories, newest first, with optional filters',
				action: 'Get many memories',
			},
			{
				name: 'Reflect',
				value: 'reflect',
				description: 'Summarize recent memories into active topics and patterns',
				action: 'Reflect on recent memories',
			},
			{
				name: 'Search',
				value: 'search',
				description: 'Find memories and uploaded documents by meaning, keywords and connections',
				action: 'Search memories',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Change the content, type, importance or tags of a memory',
				action: 'Update memory',
			},
		],
		default: 'create',
	},
];

export const memoryFields: INodeProperties[] = [
	// ---------------------------------------------------------------- create
	{
		displayName: 'Content',
		name: 'content',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		placeholder: 'e.g. The team decided to launch on Tuesday because Monday is a holiday',
		description:
			'The knowledge to remember, up to 10,000 characters. Write it so it makes sense on its own later.',
		displayOptions: { show: show(['create']) },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: show(['create']) },
		options: [
			{
				displayName: 'Confidence',
				name: 'confidence',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
				default: 0.8,
				description: 'How sure you are that this is true, from 0 to 1',
			},
			{
				displayName: 'Importance',
				name: 'importance',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
				default: 0.5,
				description: 'How important the memory is, from 0 to 1',
			},
			{
				displayName: 'Memory Type',
				name: 'memoryType',
				type: 'options',
				options: MEMORY_TYPES,
				default: 'fact',
				description: 'What kind of knowledge this is',
			},
			{
				displayName: 'Tags',
				name: 'tags',
				type: 'string',
				default: '',
				placeholder: 'e.g. project-x,decision',
				description:
					'Comma-separated tags, up to 10. Penfield stores a tag in lower case, turns spaces and underscores into hyphens and removes every other character that is not a-z, 0-9 or a hyphen; 2 to 50 characters must remain.',
			},
		],
	},

	// ---------------------------------------------------- get / update / delete
	memoryLocator('memoryId', 'Memory', 'The memory to use', show(['get', 'update', 'delete'])),

	// ---------------------------------------------------------------- update
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: show(['update']) },
		options: [
			{
				displayName: 'Confidence',
				name: 'confidence',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
				default: 0.8,
				description: 'How sure you are that this is true, from 0 to 1',
			},
			{
				displayName: 'Content',
				name: 'content',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				description: 'The full replacement text, up to 10,000 characters',
			},
			{
				displayName: 'Importance',
				name: 'importance',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
				default: 0.5,
				description: 'How important the memory is, from 0 to 1',
			},
			{
				displayName: 'Memory Type',
				name: 'memoryType',
				type: 'options',
				options: MEMORY_TYPES,
				default: 'fact',
				description: 'What kind of knowledge this is',
			},
			{
				displayName: 'Tags',
				name: 'tags',
				type: 'string',
				default: '',
				placeholder: 'e.g. project-x,decision',
				description:
					'Comma-separated tags, up to 10. They replace all existing tags; leave it empty to remove them all. Penfield stores a tag in lower case, turns spaces and underscores into hyphens and removes every other character that is not a-z, 0-9 or a hyphen; 2 to 50 characters must remain.',
			},
		],
	},

	// ---------------------------------------------------------------- getAll
	...returnAllAndLimit(show(['getAll'])),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: show(['getAll']) },
		options: [
			{
				displayName: 'Created After',
				name: 'dateFrom',
				type: 'dateTime',
				default: '',
				description: 'Only memories created after this date',
			},
			{
				displayName: 'Created Before',
				name: 'dateTo',
				type: 'dateTime',
				default: '',
				description: 'Only memories created before this date',
			},
			{
				displayName: 'Include Replaced Memories',
				name: 'includeInactive',
				type: 'boolean',
				default: false,
				description: 'Whether to include memories that were replaced by a newer version',
			},
			{
				displayName: 'Memory Type',
				name: 'memoryType',
				type: 'options',
				options: MEMORY_TYPES,
				default: 'fact',
				description: 'Only memories of this type',
			},
			{
				displayName: 'Minimum Importance',
				name: 'importanceThreshold',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
				default: 0.5,
				description: 'Only memories at least this important',
			},
			{
				displayName: 'Tags',
				name: 'tags',
				type: 'string',
				default: '',
				placeholder: 'e.g. project-x,decision',
				description: 'Only memories with at least one of these comma-separated tags',
			},
			{
				displayName: 'Time Range',
				name: 'timeRange',
				type: 'options',
				options: [
					{ name: 'Last 30 Days', value: 'month' },
					{ name: 'Last 7 Days', value: 'week' },
					{ name: 'Last 90 Days', value: 'quarter' },
					{ name: 'Last Year', value: 'year' },
					{ name: 'Today', value: 'today' },
					{ name: 'Yesterday', value: 'yesterday' },
				],
				default: 'week',
				description: 'Only memories created in this period',
			},
		],
	},
	{
		displayName: 'Sort',
		name: 'sort',
		type: 'collection',
		placeholder: 'Add Sort Rule',
		default: {},
		displayOptions: { show: show(['getAll']) },
		options: [
			{
				displayName: 'Sort By',
				name: 'field',
				type: 'options',
				options: [
					{ name: 'Created', value: 'created_at' },
					{ name: 'Importance', value: 'importance' },
					{ name: 'Updated', value: 'updated_at' },
				],
				default: 'created_at',
			},
			{
				displayName: 'Direction',
				name: 'direction',
				type: 'options',
				options: [
					{ name: 'Ascending', value: 'asc' },
					{ name: 'Descending', value: 'desc' },
				],
				default: 'desc',
			},
		],
	},

	// ---------------------------------------------------------------- search
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. what did we decide about the launch date',
		description: 'What to look for, in plain language. Up to 4,000 characters.',
		displayOptions: { show: show(['search']) },
	},
	{
		displayName: 'Search Mode',
		name: 'searchMode',
		type: 'options',
		options: [
			{
				name: 'Hybrid',
				value: 'hybrid',
				description:
					'Keywords, meaning and graph links together. Best for names, IDs and exact phrases.',
			},
			{
				name: 'By Meaning',
				value: 'semantic',
				description:
					"Ranks by meaning far more than by shared words, for when you don't know how something was worded",
			},
		],
		default: 'hybrid',
		description: 'How to rank the results',
		displayOptions: { show: show(['search']) },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 100 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: show(['search']) },
	},
	{
		displayName: 'Filters',
		name: 'searchFilters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: show(['search']) },
		options: [
			{
				displayName: 'Created After',
				name: 'startDate',
				type: 'dateTime',
				default: '',
				description: 'Only results created on or after this date',
			},
			{
				displayName: 'Created Before',
				name: 'endDate',
				type: 'dateTime',
				default: '',
				description: 'Only results created on or before this date',
			},
			{
				displayName: 'Memory Types',
				name: 'memoryTypes',
				type: 'multiOptions',
				options: MEMORY_TYPES,
				default: [],
				description: 'Only memories of these types',
			},
			{
				displayName: 'Minimum Importance',
				name: 'importanceThreshold',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
				default: 0.5,
				description: 'Only results at least this important',
			},
			{
				displayName: 'Search In',
				name: 'source',
				type: 'options',
				options: [
					{ name: 'Memories and Documents', value: 'all' },
					{ name: 'Memories Only', value: 'memories' },
					{ name: 'Documents Only', value: 'documents' },
				],
				default: 'all',
				description: 'Whether to search memories, uploaded documents, or both',
			},
			{
				displayName: 'Tags',
				name: 'tags',
				type: 'string',
				default: '',
				placeholder: 'e.g. project-x,decision',
				description: 'Only results with at least one of these comma-separated tags',
			},
		],
	},

	// --------------------------------------------------------------- reflect
	{
		displayName: 'Time Window',
		name: 'timeWindow',
		type: 'options',
		options: [
			{ name: 'Last 24 Hours', value: '1d' },
			{ name: 'Last 30 Days', value: 'month' },
			{ name: 'Last 50 Memories', value: 'recent' },
			{ name: 'Last 7 Days', value: 'week' },
			{ name: 'Last 90 Days', value: '90d' },
			{ name: 'Today', value: 'today' },
		],
		default: 'recent',
		description: 'Which memories to analyze. Created After and Created Before override it.',
		displayOptions: { show: show(['reflect']) },
	},
	{
		displayName: 'Options',
		name: 'reflectOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: show(['reflect']) },
		options: [
			{
				displayName: 'Created After',
				name: 'startDate',
				type: 'dateTime',
				default: '',
				description: 'Only memories created on or after this date',
			},
			{
				displayName: 'Created Before',
				name: 'endDate',
				type: 'dateTime',
				default: '',
				description: 'Only memories created on or before this date',
			},
			{
				displayName: 'Include Documents',
				name: 'includeDocuments',
				type: 'boolean',
				default: false,
				description: 'Whether to also analyze uploaded documents',
			},
		],
	},

	simplifyField(show(['create', 'get', 'getAll', 'search', 'update', 'reflect'])),
];
