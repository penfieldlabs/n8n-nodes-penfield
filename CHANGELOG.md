# Changelog

## 0.1.1

No changes to the node.

- Releases are now published through npm trusted publishing, with no npm token stored in the repository.
- The publish workflow refuses a tag that does not match the package.json version or that points at a commit which is not on main.

## 0.1.0

First release.

- Sign in with Penfield (OAuth 2.1 with automatic client registration and PKCE, n8n 1.119 or later), or a Penfield API key.
- Memory: Create, Delete, Get, Get Many, Reflect, Search (hybrid or by meaning) and Update, with a Simplify option.
- Relationship: Create, Delete, Explore and Get Many, with all 24 Penfield relationship types.
- Context: Save, Restore and Get Many, in the checkpoint format of Penfield's MCP server.
- Personality: Get Briefing.
- Artifact: Create, Delete, Get and Get Many.
- Memory picker with search, and usable as an AI Agent tool.
