import type { INodeProperties } from 'n8n-workflow';

const show = (operation: string[]) => ({ resource: ['artifact'], operation });

export const artifactOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['artifact'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Save a text file, such as notes, code or JSON, at a path',
				action: 'Create artifact',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Permanently delete an artifact',
				action: 'Delete artifact',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Read an artifact by its path',
				action: 'Get artifact',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List the files and folders in a folder',
				action: 'Get many artifacts',
			},
		],
		default: 'create',
	},
];

export const artifactFields: INodeProperties[] = [
	{
		displayName: 'Path',
		name: 'path',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. /project/notes/meeting.md',
		description:
			'Full path including the file name. Letters, digits, dash, underscore, dot and slash only.',
		displayOptions: { show: show(['create', 'get', 'delete']) },
	},
	{
		displayName: 'Content',
		name: 'content',
		type: 'string',
		typeOptions: { rows: 6 },
		required: true,
		default: '',
		description:
			'The file content, up to 1 MB. Saving to a path that already exists fails; delete the old artifact first.',
		displayOptions: { show: show(['create']) },
	},
	{
		displayName: 'Folder',
		name: 'folder',
		type: 'string',
		default: '/',
		placeholder: 'e.g. /project/notes',
		description: 'The folder to list. Lists only what is directly inside it.',
		displayOptions: { show: show(['getAll']) },
	},
	{
		displayName: 'Options',
		name: 'listOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: show(['getAll']) },
		options: [
			{
				displayName: 'Name Contains',
				name: 'namePattern',
				type: 'string',
				default: '',
				placeholder: 'e.g. meeting',
				description: 'Only files and folders whose name contains this text (not case-sensitive)',
			},
		],
	},
];
