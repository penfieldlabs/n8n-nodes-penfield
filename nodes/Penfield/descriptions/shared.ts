import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

export const MEMORY_TYPES: INodePropertyOptions[] = [
	{ name: 'Checkpoint', value: 'checkpoint', description: 'A snapshot of a work session' },
	{ name: 'Conversation', value: 'conversation', description: 'Something said in a conversation' },
	{ name: 'Correction', value: 'correction', description: 'A fix to earlier knowledge' },
	{ name: 'Fact', value: 'fact', description: 'Something observed or verified' },
	{ name: 'Insight', value: 'insight', description: 'A pattern or realization' },
	{ name: 'Reference', value: 'reference', description: 'A source or citation' },
	{ name: 'Relationship', value: 'relationship', description: 'Knowledge about a relationship' },
	{ name: 'Strategy', value: 'strategy', description: 'A way of doing things that works' },
	{ name: 'Task', value: 'task', description: 'Something to do' },
];

const RELATIONSHIP_TYPE_VALUES = [
	['Causes', 'causes', 'This leads to the other memory'],
	['Child Of', 'child_of', 'This is a part or subset of the other memory'],
	['Composed Of', 'composed_of', 'This contains the other memory'],
	['Contradicts', 'contradicts', 'This challenges the other memory'],
	['Depends On', 'depends_on', 'This requires the other memory'],
	['Disputes', 'disputes', 'This disagrees with the other memory'],
	['Documents', 'documents', 'This describes the other memory'],
	['Evolution Of', 'evolution_of', 'This develops from the other memory'],
	['Example Of', 'example_of', 'This demonstrates the other memory'],
	['Follows', 'follows', 'This comes after the other memory'],
	['Implements', 'implements', 'This applies the other memory'],
	['Influenced By', 'influenced_by', 'This was shaped by the other memory'],
	['Inspired By', 'inspired_by', 'This was motivated by the other memory'],
	['Parent Of', 'parent_of', 'This includes the other memory'],
	['Part Of', 'part_of', 'This belongs to the other memory'],
	['Precedes', 'precedes', 'This comes before the other memory'],
	['Prerequisite For', 'prerequisite_for', 'This is needed before the other memory'],
	['References', 'references', 'This cites the other memory'],
	['Responds To', 'responds_to', 'This answers the other memory'],
	['Sibling Of', 'sibling_of', 'This parallels the other memory'],
	['Supersedes', 'supersedes', 'This replaces the other memory'],
	['Supports', 'supports', 'This gives evidence for the other memory'],
	['Tests', 'tests', 'This validates the other memory'],
	['Updates', 'updates', 'This changes the other memory'],
] as const;

export const RELATIONSHIP_TYPES: INodePropertyOptions[] = RELATIONSHIP_TYPE_VALUES.map(
	([name, value, description]) => ({ name, value, description }),
);

export function memoryLocator(
	name: string,
	displayName: string,
	description: string,
	show: Record<string, string[]>,
): INodeProperties {
	return {
		displayName,
		name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description,
		displayOptions: { show },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: 'Select a memory...',
				typeOptions: {
					searchListMethod: 'searchMemories',
					searchable: true,
				},
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 550e8400-e29b-41d4-a716-446655440000',
				validation: [
					{
						type: 'regex',
						properties: {
							regex:
								'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
							errorMessage: 'Not a valid memory ID',
						},
					},
				],
			},
		],
	};
}

export function returnAllAndLimit(show: Record<string, string[]>): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions: { show },
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 50,
			description: 'Max number of results to return',
			displayOptions: { show: { ...show, returnAll: [false] } },
		},
	];
}

export function simplifyField(show: Record<string, string[]>): INodeProperties {
	return {
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description: 'Whether to return a simplified version of the response instead of the raw data',
		displayOptions: { show },
	};
}
