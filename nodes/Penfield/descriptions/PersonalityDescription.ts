import type { INodeProperties } from 'n8n-workflow';

export const personalityOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['personality'] } },
		options: [
			{
				name: 'Get Briefing',
				value: 'getBriefing',
				description:
					'Get the awakening briefing: the persona and standing instructions set up in Penfield, for the start of a conversation',
				action: 'Get the awakening briefing',
			},
		],
		default: 'getBriefing',
	},
];
