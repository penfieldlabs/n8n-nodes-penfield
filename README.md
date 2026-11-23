# n8n-nodes-penfield

This is an n8n community node for [Penfield](https://www.penfield.app). It gives your n8n workflows and AI agents long-term memory: Penfield stores what your AI learns as memories, links them into a knowledge graph, and finds them again with hybrid search (keywords, meaning and graph links together). The same memory is shared with every other AI app connected to your Penfield account, such as Claude, ChatGPT, Cursor or Codex.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/n8n-community-license) workflow automation platform.

[Installation](#installation) ·
[Operations](#operations) ·
[Credentials](#credentials) ·
[Compatibility](#compatibility) ·
[Usage](#usage) ·
[Resources](#resources) ·
[Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation-and-management) in the n8n community nodes documentation, and install the package `n8n-nodes-penfield`.

## Operations

The node covers everything Penfield's MCP server offers, so an n8n agent can do what Claude or ChatGPT can do with Penfield: all 17 MCP tools, plus listing and deleting memories and listing relationships for workflows.

### Memory

| Operation | What it does                                                                                                                                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create    | Save a new piece of knowledge, with an optional type, importance, confidence and tags                                                                                                                                                     |
| Delete    | Permanently delete a memory and its relationships                                                                                                                                                                                         |
| Get       | Retrieve one memory                                                                                                                                                                                                                       |
| Get Many  | List memories, newest first, filtered by type, tags, importance, date or time range                                                                                                                                                       |
| Reflect   | Summarize memories over a time window into active topics, patterns and saved checkpoints                                                                                                                                                  |
| Search    | Search memories and uploaded documents, filtered by type, tags, importance and date. **Hybrid** mode (default) is best for names, IDs and exact phrases; **By Meaning** ranks by meaning for when you don't know how something was worded |
| Update    | Change the content, type, importance or tags of a memory                                                                                                                                                                                  |

### Relationship

| Operation | What it does                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------- |
| Create    | Link two memories with one of 24 relationship types, such as Supports, Contradicts, Updates or Depends On |
| Delete    | Remove the relationship from one memory to another                                                        |
| Explore   | Follow relationships outward from a memory and return the connected memories and links                    |
| Get Many  | List the incoming, outgoing or all relationships of a memory                                              |

### Context

Checkpoints for handing work from one session or agent to another. They use the same format as Penfield's MCP server, so a checkpoint saved in n8n can be restored in Claude, and the other way round.

| Operation | What it does                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save      | Save a named checkpoint: a description of what was done and what comes next, plus the memories it is about. Names are unique in a Penfield account |
| Restore   | Load a checkpoint by name or ID, with its memories. The name `awakening` returns the personality briefing                                          |
| Get Many  | List checkpoints, newest first, optionally filtered by name                                                                                        |

### Personality

| Operation    | What it does                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| Get Briefing | Get the awakening briefing: the persona and standing instructions set up in Penfield, for the start of a conversation |

### Artifact

Artifacts are text files (notes, code, JSON, Markdown, up to 1 MB each) stored in a folder tree and read back by path. Search does not look inside artifacts.

| Operation | What it does                                              |
| --------- | --------------------------------------------------------- |
| Create    | Save a file at a path such as `/project/notes/meeting.md` |
| Delete    | Permanently delete a file                                 |
| Get       | Read a file by its path                                   |
| Get Many  | List the files and folders in a folder                    |

Memory operations have a **Simplify** option, on by default, that returns the most useful fields only. Delete operations return `{ "deleted": true }`. The node can also be used as a tool by the n8n **AI Agent** node.

## Credentials

Choose one of two ways to connect, with the node's **Authentication** setting.

### Sign in with Penfield (recommended)

1. In the node, set **Authentication** to **Sign In With Penfield** (the default) and create a new **Penfield OAuth2 API** credential.
2. Select **Connect my account**, sign in to Penfield in the window that opens, and approve access.

There is no API key or client ID to create: n8n registers itself with Penfield's sign-in server automatically (OAuth 2.1 dynamic client registration with PKCE) and renews the sign-in on its own. This needs **n8n 1.119 or later**. On older versions, use an API key.

### API key

Use a key for an n8n server nobody signs in from, or to limit what a workflow can do, for example a read-only key for an agent that should only look things up.

1. Sign in at [portal.penfield.app](https://portal.penfield.app).
2. Open **API Keys** in the portal menu ([direct link](https://portal.penfield.app/api-keys)) and create a key. **Read** and **write** cover most operations; delete operations also need **delete**. The key starts with `tm_`.
3. In the node, set **Authentication** to **API Key**, create a **Penfield API** credential and paste the key. Select **Test** to check it.

The node exchanges the key for a short-lived access token at `https://api.penfield.app/api/v2/auth/token`. n8n stores that token with the credential and renews it automatically when it expires.

The node connects only to `api.penfield.app` and, for sign-in, `auth.penfield.app`.

## Compatibility

Tested with n8n 2.48. Sign in with Penfield needs n8n 1.119 or later; the API key works on any n8n version that supports community nodes. The node uses the standard community node API (`n8nNodesApiVersion` 1) and has no runtime dependencies.

## Usage

**Give an AI Agent a memory.** Add the Penfield node as a tool of an **AI Agent** node twice: once with _Memory > Search_ and once with _Memory > Create_. In the agent's system message, add an instruction such as: "Before answering, search Penfield for what you already know about the question. When the user shares a decision, preference or correction, save it to Penfield." The agent then remembers across conversations, and across other AI apps connected to the same Penfield account.

**Hand work over between sessions.** At the end of a long agent run, add _Context > Save_ with a name such as `weekly-report-{{ $now.toFormat('yyyy-MM-dd') }}` and a description of what was done and what comes next. The next run, or Claude, uses _Context > Restore_ with that name to pick up where it left off.

**Capture meeting notes.** After a node that transcribes or summarizes a meeting, add _Memory > Create_ with content `{{ $json.summary }}` and tags `meeting-notes,{{ $json.project }}`. A later workflow can use _Memory > Search_ with the same tags to pull those notes back.

**Keep a decision history.** When a new decision replaces an old one, create the new memory, then use _Relationship > Create_ with type **Updates** from the new memory to the old one. _Relationship > Explore_ then returns the whole chain from any point.

**Store files your AI works with.** Use _Artifact > Create_ to save generated code or reports at a path, and _Memory > Create_ to save a short memory that describes the file and gives its path, so a search can find it later.

### Limits

- A memory holds up to 10,000 characters, and up to 10 tags.
- Penfield stores a tag in lower case, turns spaces and underscores into hyphens and removes every other character that is not a-z, 0-9 or a hyphen. A tag must keep 2 to 50 characters after that, or the node stops with an error that names it before anything is sent.
- Search returns up to 100 results per call.
- Checkpoint names are unique in a Penfield account. _Context > Save_ with a name that is taken, and _Context > Restore_ with a name that does not exist, stop the node with an error and change nothing, like any other failed operation. Use the node's **On Error** setting, **Retry On Fail** or an error workflow to handle them.
- An artifact holds up to 1 MB. Saving to a path that already exists fails; delete the old file first or use a new path.

## Resources

- [Penfield documentation](https://docs.penfield.app)
- [Penfield API reference](https://docs.penfield.app/api/)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- Support: support@penfield.app

## Version history

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE.md)
