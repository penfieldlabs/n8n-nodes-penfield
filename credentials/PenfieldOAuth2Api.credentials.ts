import type { ICredentialType, Icon, INodeProperties } from 'n8n-workflow';

/**
 * Sign in with a Penfield account, no API key needed.
 *
 * n8n registers itself with Penfield's sign-in server (OAuth 2.1 dynamic
 * client registration, RFC 7591) and signs in with PKCE, so there is no
 * client ID or secret to create. Needs n8n 1.119 or later; older versions
 * can use the Penfield API credential instead.
 */
export class PenfieldOAuth2Api implements ICredentialType {
	name = 'penfieldOAuth2Api';

	extends = ['oAuth2Api'];

	displayName = 'Penfield OAuth2 API';

	icon: Icon = { light: 'file:../icons/penfield.svg', dark: 'file:../icons/penfield.dark.svg' };

	documentationUrl = 'https://github.com/penfieldlabs/n8n-nodes-penfield#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Use Dynamic Client Registration',
			name: 'useDynamicClientRegistration',
			type: 'hidden',
			default: true,
		},
		{
			displayName: 'Server URL',
			name: 'serverUrl',
			type: 'hidden',
			default: 'https://api.penfield.app',
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			default: 'read write delete offline_access',
		},
	];
}
