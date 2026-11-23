import type { INodeProperties } from 'n8n-workflow';

const show = (operation: string[]) => ({ resource: ['context'], operation });

export const contextOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['context'] } },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List saved checkpoints, newest first',
				action: 'Get many contexts',
			},
			{
				name: 'Restore',
				value: 'restore',
				description: 'Load a checkpoint and the memories saved with it',
				action: 'Restore a context',
			},
			{
				name: 'Save',
				value: 'save',
				description:
					'Save a named checkpoint of the current work, for a later session or another agent',
				action: 'Save a context',
			},
		],
		default: 'save',
	},
];

export const contextFields: INodeProperties[] = [
	// ------------------------------------------------------------------ save
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. pricing-review-2026-11-21',
		description:
			'Name of the checkpoint, unique in the Penfield account. Include a date or session ID to keep it unique.',
		displayOptions: { show: show(['save']) },
	},
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		placeholder: 'e.g. Compared three pricing options. Next: confirm the annual discount.',
		description:
			"What was done, what was found and what comes next. It is also the search that picks the memories to link; under three words links the 20 most recent memories instead. Point at specific memories with memory_id: UUID or memory: 'a phrase'.",
		displayOptions: { show: show(['save']) },
	},

	// --------------------------------------------------------------- restore
	{
		displayName: 'Name or ID',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. pricing-review-2026-11-21',
		description:
			'Exact name of the checkpoint (case-sensitive), or its ID. The name "awakening" loads the personality briefing instead.',
		displayOptions: { show: show(['restore']) },
	},
	{
		displayName: 'Max Memories',
		name: 'maxMemories',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 100 },
		default: 20,
		description: 'Max number of saved memories to load with the checkpoint',
		displayOptions: { show: show(['restore']) },
	},

	// ---------------------------------------------------------------- getAll
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 100 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: show(['getAll']) },
	},
	{
		displayName: 'Options',
		name: 'contextOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: show(['getAll']) },
		options: [
			{
				displayName: 'Include Descriptions',
				name: 'includeDescriptions',
				type: 'boolean',
				default: false,
				description: "Whether to include each checkpoint's description",
			},
			{
				displayName: 'Name Contains',
				name: 'namePattern',
				type: 'string',
				default: '',
				description: 'Only checkpoints whose name contains this text, ignoring case',
			},
			{
				displayName: 'Offset',
				name: 'offset',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 0,
				description: 'How many matching checkpoints to skip',
			},
		],
	},
];
