export const starterDocument = [
  '---', 'title: Authentication architecture', 'status: draft', 'owner: Platform team', '---', '',
  '# Authentication architecture', '', '> [!NOTE]', '> This is a living design document. Every visual block remains plain text in Git.', '',
  '## Context', '', 'The application supports passwordless sign-in with a short-lived session. The diagram and table below are both editable without leaving Markdown.', '',
  '```mermaid', 'flowchart LR', '    Browser[Browser] -->|magic link| Auth[Auth API]', '    Auth --> Session[(Session store)]', '    Auth --> Mail[Email provider]', '```', '',
  '## Session contract', '', '| Field | Type | Required | Description |', '|---|---|---|---|', '| token | string | Yes | Opaque session token |', '| expiresAt | ISO 8601 | Yes | Expiration timestamp |', '| userId | UUID | Yes | Authenticated user |', '',
  '## Interaction notes', '', '- [x] Expire stale tokens after 15 minutes', '- [ ] Add rate limiting to the email endpoint', '- [ ] Review error copy with product', '',
  '```ts', 'const session = await auth.createSession({ userId })', '```', '',
].join('\n')

export const diagramTemplates = [
  { id: 'flow', name: 'Flowchart', description: 'Show a request or business flow', icon: '→', source: 'flowchart LR\n    Browser[Browser] --> API[API]\n    API --> DB[(Database)]' },
  { id: 'sequence', name: 'Sequence', description: 'Map messages between actors', icon: '↔', source: 'sequenceDiagram\n    participant U as User\n    participant A as API\n    U->>A: Sign in\n    A-->>U: Session' },
  { id: 'architecture', name: 'Architecture', description: 'Outline system boundaries', icon: '◇', source: 'flowchart TB\n    Client[Web client] --> Gateway\n    Gateway --> Service\n    Service --> Store[(Data store)]' },
]

export const tableTemplates = [
  { id: 'api', name: 'API definition', source: '| Field | Type | Required | Description |\n|---|---|---|---|\n| id | UUID | Yes | Resource identifier |\n| name | string | Yes | Display name |' },
  { id: 'db', name: 'Database schema', source: '| Column | Type | Nullable | Notes |\n|---|---|---|---|\n| id | UUID | No | Primary key |\n| created_at | timestamp | No | Creation time |' },
  { id: 'test', name: 'Test case', source: '| Case | Given | When | Then |\n|---|---|---|---|\n| Sign in | User exists | Link is opened | Session starts |' },
]
