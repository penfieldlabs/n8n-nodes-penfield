import type { INodeProperties } from 'n8n-workflow';
import { RELATIONSHIP_TYPES, memoryLocator, returnAllAndLimit } from './shared';

const show = (operation: string[]) => ({ resource: ['relationship'], operation });

export const relationshipOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['relationship'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Link two memories with a typed relationship',
				action: 'Create relationship',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Remove the relationship from one memory to another',
				action: 'Delete relationship',
			},
			{
				name: 'Explore',
				value: 'explore',
				description: 'Follow relationships outward from a memory to find connected memories',
				action: 'Explore relationships from memory',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List the relationships of a memory',
				action: 'Get many relationships',
			},
		],
		default: 'create',
	},
];

export const relationshipFields: INodeProperties[] = [
	// ------------------------------------------------------- create / delete
	memoryLocator(
		'fromMemoryId',
		'From Memory',
		'The memory the relationship starts from',
		show(['create', 'delete']),
	),
	memoryLocator(
		'toMemoryId',
		'To Memory',
		'The memory the relationship points to',
		show(['create', 'delete']),
	),
	{
		displayName: 'Relationship Type',
		name: 'relationshipType',
		type: 'options',
		options: RELATIONSHIP_TYPES,
		required: true,
		default: 'supports',
		description: 'How the first memory relates to the second',
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
				description: 'How sure you are about the relationship, from 0 to 1',
			},
			{
				displayName: 'Reason',
				name: 'reason',
				type: 'string',
				default: '',
				placeholder: 'e.g. The new decision replaces the March plan',
				description: 'Why the two memories are related',
			},
			{
				displayName: 'Strength',
				name: 'strength',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
				default: 0.5,
				description: 'How strong the relationship is, from 0 to 1',
			},
		],
	},

	// ------------------------------------------------------ getAll / explore
	memoryLocator('memoryId', 'Memory', 'The memory to start from', show(['getAll', 'explore'])),
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
				displayName: 'Direction',
				name: 'direction',
				type: 'options',
				options: [
					{ name: 'Both', value: 'any', description: 'Relationships to and from the memory' },
					{
						name: 'Incoming',
						value: 'incoming',
						description: 'Relationships that point to the memory',
					},
					{
						name: 'Outgoing',
						value: 'outgoing',
						description: 'Relationships that start from the memory',
					},
				],
				default: 'any',
			},
			{
				displayName: 'Relationship Type',
				name: 'relationshipType',
				type: 'options',
				options: RELATIONSHIP_TYPES,
				default: 'supports',
				description: 'Only relationships of this type',
			},
		],
	},
	{
		displayName: 'Max Depth',
		name: 'maxDepth',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 10 },
		default: 2,
		description: 'How many relationships away from the memory to go',
		displayOptions: { show: show(['explore']) },
	},
	{
		displayName: 'Options',
		name: 'exploreOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: show(['explore']) },
		options: [
			{
				displayName: 'Direction',
				name: 'direction',
				type: 'options',
				options: [
					{ name: 'Both', value: 'ANY' },
					{ name: 'Incoming', value: 'INBOUND' },
					{ name: 'Outgoing', value: 'OUTBOUND' },
				],
				default: 'ANY',
				description: 'Which way to follow relationships',
			},
			{
				displayName: 'Relationship Types',
				name: 'relationshipTypes',
				type: 'multiOptions',
				options: RELATIONSHIP_TYPES,
				default: [],
				description: 'Only follow relationships of these types',
			},
		],
	},
];
