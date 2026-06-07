# Professor Demo Export Template Plan

## Demo Goal

Show a complete path from editing generated quest nodes in the web UI to pushing exported quest files into a Git repository in a selected format.

Target demo story:

1. User optionally configures a quest export template under Settings.
2. User creates a questline from a story prompt.
3. User chooses one configured template during creation, or leaves the selector on "No template".
4. If a template is chosen, the backend uses the template's saved AI analysis schema when extracting objectives and rewards.
5. If no template is chosen, AI keeps the current story-only behavior and creates objectives/rewards from the story.
6. Generated questline is opened in Quest Builder.
7. User edits at least one quest node in the UI; each node represents one quest.
8. If the selected template contains dialog sections, user edits the quest node's start, in-progress, and completion dialog in the node form.
9. User opens Export.
10. User selects which quest nodes to export, or chooses the whole questline.
11. User selects an export format/template.
12. User selects a destination root folder.
13. User clicks Push to Git.
14. Exported files appear under a questline-specific folder inside the selected repository folder.

Important template principle:

- The raw uploaded template is only the input.
- After the template reaches the backend, the backend parses it and asks AI to analyze it into a reusable quest-template schema.
- Quest generation, the node edit form, preview, export, and Git push should use that saved schema instead of repeatedly guessing from the raw template.

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

Support arbitrary one-quest templates and use the professor's real template during the demo.

Example validation templates:

```text
Maple XML quest-node template
Free Tier 3 JSON quest-node template
```

These templates are examples only. They are not the application's schema, and field names from them must not be hardcoded as the only supported quest fields.

Required template capabilities:

- Defines the final export shape for one quest.
- Applies to a specific quest node, not the whole questline.
- Lets the user export one selected quest node, multiple selected quest nodes, or the whole questline as a set of quest-node exports.
- Treats objectives, requirements, rewards, metadata, and dialog as fields inside the exported quest file when those concepts exist in the selected template.
- Does not treat NPCs as exportable game assets. NPCs stay as story/context data for the quest, and future NPC images can be handled by a separate image/game-asset export path.
- Declares placeholder fields the app can fill.
- Supports one output file per exported quest node.
- Can be previewed before export.
- Can be used as AI context during objective/reward extraction.
- Defines what happens when no template is selected: use normal story-only generation and export YAML by default.

JSON validation example:

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

XML validation example shape:

```xml
<imgdir name="Quest Name">
  <imgdir name="info">
    <int name="questId" value="0"/>
    <int name="preQuest" value="-1"/>
    <int name="daily" value="0"/>
  </imgdir>
  <imgdir name="toKill">
    <imgdir name="0">
      <int name="monsterId" value="100100"/>
      <int name="amount" value="15"/>
    </imgdir>
  </imgdir>
  <imgdir name="toCollect">
    <imgdir name="0">
      <int name="itemId" value="1302001"/>
      <int name="quantity" value="1"/>
    </imgdir>
  </imgdir>
  <imgdir name="rewards">
    <imgdir name="items">
      <imgdir name="0">
        <int name="itemId" value="1302000"/>
        <int name="quantity" value="1"/>
      </imgdir>
    </imgdir>
    <int name="meso" value="5000"/>
    <int name="exp" value="2147483647"/>
  </imgdir>
</imgdir>
```

Template parsing and analysis notes:

- Templates should be accepted as JSON, YAML, or XML.
- For the demo, each template defines one output file shape.
- The app should not require the user to write `aiHints`.
- The backend should create an internal AI-analyzed schema after parsing the template.
- The AI-analyzed schema should explain what each meaningful field represents, which fields are editable, which fields can be AI-filled, and how the field should appear in the node edit form.
- The schema should describe generic gameplay roles, not specific field names. Examples include quest identifier, prerequisite, repeatability flag, requirement, combat requirement, collection requirement, currency reward, experience reward, item reward, and quest dialog.
- The schema should detect quest dialog sections when the selected template contains them. Example paths are `start.pages`, `inProgress.pages`, and `complete.pages`, but other dialog paths must be supported if the AI analysis marks them as dialog fields.
- XML and Maple-style `imgdir` templates must preserve node order, attributes, repeated names, comments where useful, and typed value nodes such as `int`, `string`, and `canvas`.
- The schema must not copy example IDs, amounts, names, or item values from the uploaded template as generated answers.
- Code must not special-case only `to_kill`, `to_collect`, `toKill`, `toCollect`, or `rewards.items`. Those names are examples; the saved schema controls which paths are editable, AI-filled, and exported.
- If AI analysis fails, the backend can keep a deterministic parser fallback, but the template should be marked as needing analysis so the UI can show that the template is using fallback labels.
- If the user chooses "No template", the default export format should be YAML.

Resolved decisions:

- Add a dedicated phase for mapping analyzed template fields to quest-node data.
- Any template field analyzed as a requirement can be AI-filled and manually edited.
- ID-like fields should be manually typed for the first demo unless the generated data already has a clear value.

## Phase 2: Map Analyzed Template Fields

Define how one Quest Builder node becomes one file matching the selected quest template.

Generic mapping contract:

| Analyzed role | Example paths only | Source for first demo | Notes |
| --- | --- | --- |
| Quest name/title | `name`, root `imgdir@name` | Quest node title | Editable in the node form. |
| Quest ID | `quest_id`, `info.questId` | Quest-node template value | Generate a stable default per node, then allow manual override. |
| Prerequisite quest | `pre_quest`, `info.preQuest` | Quest graph dependencies | Derive from incoming connected quest nodes when possible, then allow manual override. |
| Quest flag/metadata | `silent`, `daily`, `info.daily` | Quest-node template value | Default from the uploaded template, manually editable. |
| Requirement group | `to_kill`, `toKill`, `toCollect`, custom requirement paths | AI suggestion plus manual rows | The row fields come from the schema, not from hardcoded `id`/`amount` names. |
| Reward group | `rewards.items`, `rewards.meso`, `rewards.exp`, custom reward paths | Manual or AI-assisted values | The editor must support item rewards, currency/exp rewards, and unknown reward structures. |
| Dialog group | `start.pages`, `inProgress.pages`, `complete.pages`, custom dialog paths | AI draft plus manual editor | Dialog paths come from schema analysis. |
| Unknown editable field | Any path marked editable by analysis | Manual value | Render with generic text/number/checkbox/JSON/rows controls. |

The mapper must store values by template path, not by hardcoded game concept. For example:

```ts
templateValues["info.questId"] = 1001
templateValues["toKill"] = [{ monsterId: 100100, amount: 15 }]
templateValues["to_collect"] = [{ item_id: 4000002, amount: 80 }]
templateValues["rewards.exp"] = 5000
templateValues["start.pages"] = [...]
```

The same UI and exporter must work whether the selected template uses snake_case JSON keys, camelCase XML node names, Maple `imgdir` children, or a different field naming style.

Dialog field shape:

```yaml
start:
  pages:
    - id: "start_intro"
      npcId: 9010000
      type: next
      next: "start_details"
      prompt: |
        Intro text shown before accepting the quest.
inProgress:
  pages:
    - id: "progress_hint"
      npcId: 9010000
      type: ok
      prompt: |
        Hint shown while the quest is active.
complete:
  pages:
    - id: "complete_ready"
      npcId: 9010000
      type: yesNo
      complete: true
      prompt: |
        Completion text shown before rewards are delivered.
```

Dialog storage:

```ts
templateValues["start.pages"] = QuestDialogPage[]
templateValues["inProgress.pages"] = QuestDialogPage[]
templateValues["complete.pages"] = QuestDialogPage[]
```

Dialog page type:

```ts
type QuestDialogPage = {
  id: string;
  npcId: number;
  type?: "next" | "nextPrev" | "yesNo" | "ok";
  next?: string;
  prev?: string;
  yes?: string;
  no?: string;
  accept?: boolean;
  complete?: boolean;
  end?: boolean;
  prompt: string;
};
```

Implementation tasks:

1. Add per-node template value storage keyed by analyzed template paths.
2. Add deterministic defaults for fields whose analyzed role is quest ID.
3. Add a graph helper that can suggest fields whose analyzed role is prerequisite quest.
4. Add generic row controls for array/object fields using each field's analyzed item schema.
5. Add generic scalar controls for text, number, boolean, and enum-like fields.
6. Preserve raw generated objective/reward text separately from template-mapped export fields.
7. Add dialog page storage for templates that contain dialog sections.
8. Validate dialog references so `next`, `prev`, `yes`, and `no` point to existing page IDs inside the same dialog phase unless intentionally left blank.

Acceptance criteria:

- Every editable field in the analyzed template schema has a clear source or a generic manual control.
- AI suggestions can prefill analyzed requirement/dialog fields, but the user can manually correct them.
- ID-like fields are manual for the demo unless generated data provides a value.
- Dialog pages can be drafted by AI and manually corrected per quest node.
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
templateAst?: object
description?: string
acceptedInputFormat?: "json" | "yaml" | "xml"
targetScope: "quest-node"
defaultOutputFormat?: "json" | "yaml" | "xml"
fieldSchema?: object
templateSchema?: {
  version: number
  summary: string
  editableFields: Array<{
    path: string
    templatePath: string
    label: string
    description: string
    valueType: "string" | "number" | "boolean" | "array" | "object"
    control: "text" | "number" | "checkbox" | "json" | "rows" | "dialogFlow"
    gameplayRole?: "questName" | "questId" | "questFlag" | "preQuest" | "requirement" | "combatRequirement" | "collectionRequirement" | "reward" | "itemReward" | "currencyReward" | "experienceReward" | "questDialog" | "other"
    fillSource: "node" | "graph" | "ai" | "manual" | "templateDefault"
    required: boolean
    itemSchema?: Array<{
      path: string
      label: string
      valueType: "string" | "number" | "boolean"
      required: boolean
    }>
  }>
  generationContract: {
    requirementRoles: string[]
    rewardRoles: string[]
    dialogRoles: string[]
    promptSummary: string
  }
  exportBindings: Array<{
    path: string
    source: "node.title" | "node.exportFields" | "node.templateValues" | "graph.incomingEdges" | "template.default"
  }>
}
analysisStatus?: "pending" | "ready" | "fallback" | "failed"
analysisError?: string
analyzedAt?: Date
schemaSummary?: {
  requirementFields?: string[]
  rewardFields?: string[]
  dialogFields?: string[]
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
7. Add a parser that can normalize JSON, YAML, and XML templates into a common template AST while preserving the original output shape.
8. For XML/Maple-style templates, preserve tags, attributes, child order, repeated nodes, comments where useful, and typed value nodes.
9. Infer a deterministic `fieldSchema` from the template AST as the parser fallback.
10. Add an AI template-analysis service that receives the parsed structure summary and returns `templateSchema`.
11. Store `analysisStatus`, `analysisError`, and `analyzedAt`.
12. Add a re-analyze endpoint for a saved template.
13. Add a small helper that normalizes template records for frontend use.

Template AST requirements:

- JSON/YAML templates can use normal object/array/scalar nodes.
- XML templates need an AST, not a lossy object conversion.
- Maple XML paths should be based on `imgdir` and typed node `name` attributes, for example `info.questId`, `toKill[].monsterId`, and `rewards.items[].itemId`.
- Repeated XML fields such as two `<int name="exp" .../>` nodes must remain distinct in the AST and export output.
- Rendering should update only analyzed/editable nodes, then serialize the original AST back to the requested output format.

AI template-analysis behavior:

1. The backend parses the uploaded JSON/YAML/XML into `structure`.
2. The backend sends a compact structure summary to AI, not the whole quest story.
3. AI returns a strict JSON schema describing:
   - friendly field labels
   - gameplay role for each field
   - value type and editor control
   - whether the field should be AI-filled, graph-filled, manually edited, or left as template default
   - requirement/reward/dialog categories generation should produce for this template
   - row item schemas for arbitrary array/object fields
   - whether nested page arrays should use the dialog flow editor
4. Backend validates the AI response before saving it.
5. If AI returns invalid JSON or quota fails, save the template with parser fallback and `analysisStatus: "fallback"` instead of blocking the user.
6. Built-in templates should also have a saved `templateSchema`, either generated once or checked into the seed data.

Acceptance criteria:

- Built-in templates load for every user.
- User-created templates can be JSON, YAML, or XML.
- User-created templates define one quest-node output file shape.
- The system can analyze editable fields from the template structure and store a reusable schema.
- Invalid template uploads return a useful error.
- Template save does not depend on AI being available, but the UI clearly marks fallback analysis.

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
5. Show AI-analyzed template fields.
6. Summarize analyzed gameplay roles with friendly labels generated from the schema, such as requirements, rewards, metadata, and quest dialog.
7. Show analysis status: ready, fallback, or failed.
8. Let the user re-run analysis after editing a template.
9. Keep raw template keys as secondary technical details, not as the main UI labels.
10. Allow delete/edit for custom templates.
11. Show read-only badge for built-in templates.

Suggested UI fields:

- Template name
- Template engine/type
- File extension
- Input format: JSON, YAML, or XML
- Default output format
- Parsed field summary with friendly labels
- AI analysis status and generated schema summary
- Optional advanced source-field details
- Raw template editor or upload box
- Validation status

Acceptance criteria:

- User can create a template from Settings.
- Template appears later in Create flow.
- Invalid template input does not save.
- Valid template input saves even if AI analysis falls back.
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
4. Show template description, analysis status, and schema summary beneath dropdown.
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
    templateAst?: object;
    targetScope: "quest-node";
    templateSchema?: object;
  };
}
```

Backend behavior:

1. If `templateId` is provided, load the template and verify:
   - built-in, or
   - owned by current user.
2. Summarize the saved template schema for the prompt.
3. Ask AI to infer quest requirements, rewards, and optional dialog notes using the saved `templateSchema.generationContract`.
4. If the schema includes `questDialog`, include a short dialog-generation note so later questline generation can draft node dialog pages.
5. If no template is supplied, keep the current story-only generation behavior.

Prompt requirements:

- Do not copy placeholder names, IDs, item values, monster values, amounts, or example text as generated answers.
- When a template is supplied, follow the analyzed schema instead of forcing 3 to 7 objectives and 3 to 7 rewards.
- When no template is supplied, still return 3 to 7 objectives and 3 to 7 rewards.
- Still return valid JSON only.

Acceptance criteria:

- Template-aware generation produces requirements, rewards, and dialog hints shaped toward the template's analyzed schema.
- Template-aware questline generation can draft dialog page data when the schema contains dialog fields.
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
2. Save template ID and snapshot, including the analyzed schema, onto the questline.
3. Include template metadata in export payload.

Acceptance criteria:

- Newly generated questline records remember the selected template.
- Export can use the snapshot even if the source template changes.
- Quest Builder can render the node edit form from the saved schema snapshot.

## Phase 8: Quest Builder Edit Demo

Make sure the edit path is demo-ready.

Demo action:

1. Open generated questline.
2. Click one node.
3. Edit the node through a modular form generated from the selected template's AI-analyzed schema.
4. The form should render fields from the selected template schema, regardless of whether the template uses JSON snake_case fields, Maple XML `imgdir` fields, or another one-quest structure.
5. If the template includes dialog fields, the form should show a dialog flow editor for those analyzed dialog paths.
6. Save graph.

Existing areas to verify:

```text
frontend/src/app/pages/QuestBuilder/QuestBuilder.tsx
frontend/src/app/pages/QuestBuilder/components/NodeEditSidebar.tsx
backend/src/controllers/questlineController.ts
```

Acceptance criteria:

- Node edit forms can change based on the selected template.
- The JSON and XML validation templates both create useful forms without hardcoding either template.
- Field labels and helper text come from the analyzed schema, not only raw template keys.
- Dialog sections are edited as structured pages, not as one raw JSON blob.
- Dialog data is saved per node in `templateValues`.
- Edited node persists after refresh.
- Export uses edited values, not stale generation values.
- Export preserves the selected template's original field names and structure.

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
- Confirm the real professor template and verify the analyzer creates editable fields from it.
- Confirm Git provider is GitHub only.
- Confirm whether NPC images are out of scope for this demo export.
- Confirm professor demo validation templates.
- Confirm whether template schema should affect only requirement/reward/dialog extraction or also full questline generation.
