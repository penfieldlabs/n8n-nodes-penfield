import type {
	IAuthenticateGeneric,
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestHelper,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class PenfieldApi implements ICredentialType {
	name = 'penfieldApi';

	displayName = 'Penfield API';

	icon: Icon = { light: 'file:../icons/penfield.svg', dark: 'file:../icons/penfield.dark.svg' };

	documentationUrl = 'https://github.com/penfieldlabs/n8n-nodes-penfield#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			placeholder: 'e.g. tm_pf_..._ak_...',
			description:
				'Create an API key in the Penfield portal under API Keys. Give it read and write permission, and delete permission if you use delete operations.',
		},
		{
			displayName: 'Session Token',
			name: 'sessionToken',
			type: 'hidden',
			typeOptions: { expirable: true, password: true },
			default: '',
		},
	];

	// Penfield does not accept the API key on data endpoints. It is exchanged
	// for a short-lived access token, which n8n caches in `sessionToken` and
	// renews automatically when a request returns 401.
	async preAuthentication(this: IHttpRequestHelper, credentials: ICredentialDataDecryptedObject) {
		let response: { data?: { access_token?: string } };
		try {
			response = (await this.helpers.httpRequest({
				method: 'POST',
				url: 'https://api.penfield.app/api/v2/auth/token',
				headers: {
					Authorization: `Bearer ${credentials.apiKey}`,
					'Content-Type': 'application/json',
				},
				json: true,
			})) as { data?: { access_token?: string } };
		} catch (error) {
			const status = (error as { response?: { status?: number }; httpCode?: string }).response
				?.status;
			if (status === 401 || String((error as { httpCode?: string }).httpCode) === '401') {
				throw new Error(
					'Penfield rejected this API key. Check it in the Penfield portal under API Keys.',
				);
			}
			throw error;
		}
		const sessionToken = response?.data?.access_token;
		if (!sessionToken) {
			throw new Error('Penfield did not return an access token for this API key');
		}
		return { sessionToken };
	}

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.sessionToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.penfield.app/api/v2',
			url: '/auth/verify',
			method: 'GET',
		},
	};
}
