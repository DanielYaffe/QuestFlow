# Professor Demo Export Template Plan

## Demo Goal

Show a complete path from editing generated quest nodes in the web UI to pushing exported quest files into a Git repository in a selected format.

Target demo story:

1. User optionally configures a quest export template under Settings.
2. User creates a questline from a story prompt.
3. User chooses one configured template during creation, or leaves the selector on "No template".
4. If a template is chosen, AI uses it as context when extracting objectives and rewards.
5. If no template is chosen, AI keeps the current story-only behavior and creates objectives/rewards from the story.
6. Generated questline is opened in Quest Builder.
7. User edits at least one quest node in the UI; each node represents one quest.
8. User opens Export.
9. User selects which quest nodes to export, or chooses the whole questline.
10. User selects an export format/template.
11. User selects a destination root folder.
12. User clicks Push to Git.
13. Exported files appear under a questline-specific folder inside the selected repository folder.

## Current State Observed

Existing pieces:

- Settings route/page is present:
  - `frontend/src/app/pages/Settings/Settings.tsx`
  - `frontend/src/app/App.tsx`
  - `frontend/src/app/components/layout/TopNav.tsx`
- Settings currently contains GitHub integration only:
  - `frontend/src/app/pages/Settings/components/GitHubSettingsCard.tsx`
- GitHub settings persistence already exists:
  - `backend/src/models/userModel.ts`
  - `backend/src/controllers/userSettingsController.ts`
  - `backend/src/routes/userSettingsRoute.ts`
- Quest Builder already has export and push UI:
  - `frontend/src/app/pages/QuestBuilder/components/ExportDialog.tsx`
  - `frontend/src/app/pages/QuestBuilder/components/PushToGithubDialog.tsx`
- Backend export and GitHub push already exist:
  - `backend/src/controllers/questExportController.ts`
  - `backend/src/services/questExport`
  - `backend/src/services/githubService.ts`
- Quest generation already has multi-step flow:
  - story input
  - style selection
  - objectives/rewards selection
  - characters selection
  - final questline generation
- Backend quest generation already accepts story, genre, objectives, rewards, characters, and style.

Missing or incomplete pieces on the current branch:

- No active export-template model/controller/routes/frontend API are present on this base branch.
- No Settings UI for managing quest export templates is present.
- Template choice is not under the story textbox.
- Selected template is not sent to the objective/reward generation endpoint.
- Selected template is not persisted on the generated questline.
- Export dialog has a format selector, preview, download, and GitHub push, but no template selector.
- Export dialog does not have quest-node selection for exporting specific quests.
- Current GitHub push writes one exported file to the selected path; it does not create a separate folder per questline.
- Backend export templates are not yet connected to final questline export.
- Per-node quest export is not modeled in the export pipeline.

## Phase 1: Define The Demo Contract

Create one demo template format and use it throughout the first demo.

Example demo template name:

```text
Free Tier 3
```

Required template capabilities:

- Defines the final export shape for one quest.
- Applies to a specific quest node, not the whole questline.
- Lets the user export one selected quest node, multiple selected quest nodes, or the whole questline as a set of quest-node exports.
- Treats objectives and rewards as fields inside the exported quest file.
- Does not treat NPCs as exportable game assets. NPCs stay as story/context data for the quest, and future NPC images can be handled by a separate image/game-asset export path.
- Declares placeholder fields the app can fill.
- Supports one output file per exported quest node.
- Can be previewed before export.
- Can be used as AI context during objective/reward extraction.
- Defines what happens when no template is selected: use normal story-only generation and export YAML by default.

Demo template example:

```json
{
  "name": "Free Tier 3",
  "quest_id": 2,
  "silent": "true",
  "pre_quest": [-1],
  "daily": "false",
  "to_kill": [
    { "id": 100134, "amount": 200 }
  ],
  "to_collect": [
    { "item_id": 4000002, "amount": 80 }
  ],
  "rewards": {
    "items": [
      { "id": 4000006, "amount": 100 },
      { "id": 5072000, "amount": 20 }
    ]
  }
}
```

Template parsing notes:

- Templates should be accepted as JSON, YAML, or XML.
- For the demo, each template defines one output file shape.
- The app should infer field guidance from the template structure instead of requiring the user to write `aiHints`.
- `aiHints` can be an internal generated summary only: it explains to the AI what fields like `to_kill`, `to_collect`, and `rewards.items` mean. It should not be a required user-facing template field.
- If the user chooses "No template", the default export format should be YAML.

Resolved decisions:

- Add a dedicated phase for mapping required template fields to quest-node data.
- `to_kill` and `to_collect` should be both AI-filled and manually editable.
- Reward item IDs should be manually typed for the first demo.

## Phase 2: Map Required Quest Fields

Define how one Quest Builder node becomes one file matching the selected quest template.

Required mapping for the example template:

| Template field | Source for first demo | Notes |
| --- | --- | --- |
| `name` | Quest node title | Editable in the node form. |
| `quest_id` | Quest-node export metadata | Generate a stable default per node, then allow manual override. |
| `silent` | Quest-node export metadata | Default from the template, manually editable. |
| `pre_quest` | Quest graph dependencies | Derive from incoming connected quest nodes when possible, then allow manual override. |
| `daily` | Quest-node export metadata | Default from the template, manually editable. |
| `to_kill` | AI suggestion plus manual rows | AI can suggest combat targets from objectives; user can add, remove, and edit IDs/amounts. |
| `to_collect` | AI suggestion plus manual rows | AI can suggest collection requirements from objectives; user can add, remove, and edit item IDs/amounts. |
| `rewards.items` | Manual rows for first demo | User types reward item IDs and amounts manually. |

Implementation tasks:

1. Add per-node export metadata storage for required scalar fields.
2. Add a deterministic default `quest_id` generator for nodes that do not have one yet.
3. Add a graph helper that can suggest `pre_quest` from incoming edges.
4. Add editable row controls for combat targets and collection requirements.
5. Add manual reward item rows with item ID and amount fields.
6. Preserve raw generated objective/reward text separately from template-mapped export fields.

Acceptance criteria:

- Every required field in the example template has a clear source.
- AI suggestions can prefill objectives, but the user can manually correct them.
- Reward item IDs are manual for the demo.
- Export uses the mapped node fields, not only the original generated text.

## Phase 3: Backend Template Model

Add export templates to support generation and export metadata on top of `feat/quest-export-github-push`.

Initial model fields:

```text
ownerId?
name
engine
isBuiltIn
structure
description?: string
acceptedInputFormat?: "json" | "yaml" | "xml"
targetScope: "quest-node"
defaultOutputFormat?: "json" | "yaml" | "xml"
fieldSchema?: object
inferredAiGuidance?: {
  objectiveFields?: string[]
  rewardFields?: string[]
  structureSummary?: string
}
output?: {
  extension: string
  mimeType: string
  mode: "json" | "yaml" | "xml" | "img"
}
```

Implementation tasks:

1. Add `ExportTemplateSchema`, model, controller, and route.
2. Add frontend API helpers for export templates.
3. Default missing values:
   - `targetScope` to `"quest-node"`
   - `defaultOutputFormat` to `"yaml"`
   - `output.extension` from selected template format
4. Add validation in `exportTemplateController.create`.
5. Add `PUT /export-templates/:id` for editing templates.
6. Add ownership checks for update and delete.
7. Add a parser that can normalize JSON, YAML, and XML templates into a common template object.
8. Infer a `fieldSchema` from the template so quest nodes can render a matching edit form.
9. Add a small helper that normalizes template records for frontend use.

Acceptance criteria:

- Built-in templates load for every user.
- User-created templates can be JSON, YAML, or XML.
- User-created templates define one quest-node output file shape.
- The system can infer editable fields from the template structure.
- Invalid template uploads return a useful error.

## Phase 4: Settings Page Template Manager

Add template management to the existing Settings page.

Files to update/add:

```text
frontend/src/app/pages/Settings/Settings.tsx
frontend/src/app/pages/Settings/components/QuestTemplateSettingsCard.tsx
frontend/src/app/pages/Settings/components/TemplateUploadModal.tsx
frontend/src/app/api/exportTemplateApi.ts
```

Template UI tasks:

1. Show list of built-in and user templates.
2. Allow upload/paste of template JSON, YAML, or XML.
3. Let user give each template a name.
4. Validate template before saving.
5. Show detected template fields.
6. Summarize detected gameplay requirements with friendly labels:
   - Combat objectives
   - Collection objectives
   - Item rewards
7. Keep raw template keys as secondary technical details, not as the main UI labels.
8. Allow delete/edit for custom templates.
9. Show read-only badge for built-in templates.

Suggested UI fields:

- Template name
- Template engine/type
- File extension
- Input format: JSON, YAML, or XML
- Default output format
- Parsed field summary with friendly labels
- Optional advanced source-field details
- Raw template editor or upload box
- Validation status

Acceptance criteria:

- User can create a template from Settings.
- Template appears later in Create flow.
- Invalid template input does not save.
- Built-in templates remain available.

## Phase 5: Template Dropdown Under Story Input

Move template selection earlier into the Create page.

Files to update:

```text
frontend/src/app/pages/QuestCreate/QuestCreate.tsx
frontend/src/app/pages/QuestCreate/components/StepStory.tsx
frontend/src/app/api/exportTemplateApi.ts
frontend/src/app/api/questCreateApi.ts
```

State changes:

Add to `WizardState`:

```ts
selectedTemplateId?: string;
selectedTemplateSnapshot?: ExportTemplate;
```

UI changes:

1. Under the story textbox, add template dropdown.
2. Load templates on QuestCreate mount.
3. Default to "No template".
4. Show template description and field summary beneath dropdown.
5. Keep genre chips below the template selector.
6. When "No template" is selected, do not send template data to the AI.

Acceptance criteria:

- User sees templates created in Settings.
- User can create without choosing a template.
- Selected template stays selected through all creation steps.
- No-template creation produces objectives/rewards from the story only.

## Phase 6: Send Template To Objective/Reward AI

Update objective/reward generation so the selected template informs the AI.

Backend files:

```text
backend/src/controllers/questGenerationController.ts
backend/src/routes/questGenerationRoute.ts
```

Frontend files:

```text
frontend/src/app/api/questCreateApi.ts
frontend/src/app/pages/QuestCreate/QuestCreate.tsx
```

Request shape:

```ts
{
  story: string;
  genre: string;
  templateId?: string;
  template?: {
    name: string;
    structure: object;
    targetScope: "quest-node";
    inferredAiGuidance?: object;
  };
}
```

Backend behavior:

1. If `templateId` is provided, load the template and verify:
   - built-in, or
   - owned by current user.
2. Summarize the template structure for the prompt.
3. Ask AI to infer objectives and rewards that fit the template's quest-node fields.
4. If no template is supplied, keep the current story-only generation behavior.

Prompt requirements:

- Do not copy placeholder names as final objective/reward names.
- When a template is supplied, follow the template structure instead of forcing 3 to 7 objectives and 3 to 7 rewards.
- When no template is supplied, still return 3 to 7 objectives and 3 to 7 rewards.
- Still return valid JSON only.

Acceptance criteria:

- Template-aware generation produces objectives/rewards shaped toward the template.
- No-template flow still works.
- Unauthorized template ID is rejected.

## Phase 7: Persist Template Choice On Questline

The export step must know which template was used during generation.

Backend model changes:

Add to `QuestlineSchema`:

```text
templateId?: string
templateSnapshot?: object
templateName?: string
```

Why store a snapshot:

- If the user edits/deletes the template later, the questline can still export using the exact demo-time template.
- It makes the demo reproducible.

Generation changes:

1. `generateQuestline` accepts selected template metadata.
2. Save template ID and snapshot onto the questline.
3. Include template metadata in export payload.

Acceptance criteria:

- Newly generated questline records remember the selected template.
- Export can use the snapshot even if the source template changes.

## Phase 8: Quest Builder Edit Demo

Make sure the edit path is demo-ready.

Demo action:

1. Open generated questline.
2. Click one node.
3. Edit the node through a modular form generated from the selected template schema.
4. For the example template, the form should include fields such as `name`, `quest_id`, `silent`, `pre_quest`, `daily`, `to_kill`, `to_collect`, and `rewards.items`.
5. Save graph.

Existing areas to verify:

```text
frontend/src/app/pages/QuestBuilder/QuestBuilder.tsx
frontend/src/app/pages/QuestBuilder/components/NodeEditSidebar.tsx
backend/src/controllers/questlineController.ts
```

Acceptance criteria:

- Node edit forms can change based on the selected template.
- The example template creates a useful form without hardcoding only that template.
- Edited node persists after refresh.
- Export uses edited values, not stale generation values.

## Phase 9: Export Dialog With Quest Node Selection

Add quest-node selection to export.

UI requirements:

- Show all quest nodes in the questline.
- Each node has a checkbox because each node represents one exportable quest.
- Include a "Whole questline" option that exports all quest nodes.
- Do not show NPCs as an exportable category.
- Rewards/objectives are edited and exported as fields inside each selected quest node.
- User can select all/none.
- Export preview updates when selected nodes change.
- Show the target folder layout before pushing.

Backend export request:

```text
GET /questlines/:id/export/preview?format=template-json&templateId=...&nodeIds=node-a,node-b
GET /questlines/:id/export?format=template-json&templateId=...&nodeIds=node-a,node-b
```

Backend tasks:

1. Add node selection to the canonical export builder or export renderer.
2. Do not delete data from the database; filter only export output.
3. If `nodeIds` is omitted for "Whole questline", export all quest nodes.
4. Template renderer receives:
   - canonical export payload
   - selected quest nodes
   - template snapshot
   - selected output format

Acceptance criteria:

- Unchecked quest nodes do not appear in exported output.
- Each selected node can render as one quest file using the selected template.
- Whole questline export uses the same node renderer for every node.
- Preview matches downloaded file.

## Phase 10: Push To Git

Extend the existing Git push flow for the demo.

Required UI:

- Button: `Push to Git`
- Repository owner/name
- Branch
- Destination root folder
- Questline folder preview
- Commit message
- Selected format/template

Backend requirements:

- Store Git token securely in Settings.
- Push exported content to configured repository.
- Support the selected template format.
- Treat the selected destination path as a root folder.
- Create a different child folder for each questline under that root folder.
- Use a stable folder name, such as `questline-slug-questlineId`.
- Always push exported files to `<root>/<questline-folder>/<filename>`.
- Use the same path pattern when exporting one node, multiple nodes, or the whole questline.
- Return final repository paths to UI.

Existing endpoints to extend:

```text
GET /users/me/git-settings
PUT /users/me/git-settings
POST /questlines/:id/push-to-github
```

Demo acceptance criteria:

- User clicks Push to Git.
- Git repository receives a new questline-specific folder under the selected root folder.
- Every exported file is placed directly under `<root>/<questline-folder>/`.
- Exported content matches the export preview.
- Commit message is readable.
- If no template was chosen, push still works using the selected standard export format.

## Phase 11: Professor Demo Script

Script the exact demo path.

Demo preparation:

1. Create test user.
2. Configure Git settings.
3. Add professor template in Settings.
4. Prepare one short story prompt.
5. Confirm backend and frontend env files are set.

Live demo:

1. Open Settings.
2. Upload professor template.
3. Go to Create.
4. Enter story.
5. Pick professor template.
6. Generate objectives/rewards.
7. Select relevant objectives/rewards.
8. Generate questline.
9. Edit one node in Quest Builder.
10. Open Export.
11. Select one or more quest nodes, or select the whole questline.
12. Confirm the questline folder path.
13. Preview export.
14. Push to Git.
15. Open Git repository and show the questline folder.

Backup plan:

- Keep a pre-created questline ready.
- Keep a pre-saved template ready.
- Keep Git settings preconfigured.
- If AI is slow, start from the pre-created questline and show export/push.

## Review Checklist

- Confirm desired export file extension.
- Confirm exact template input formats: JSON, YAML, and XML.
- Confirm exact editable fields for the Free Tier 3 example.
- Confirm Git provider is GitHub only.
- Confirm whether NPC images are out of scope for this demo export.
- Confirm first demo template example.
- Confirm whether template should affect only objectives/rewards or also full questline generation.
