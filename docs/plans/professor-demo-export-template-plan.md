# Professor Demo Export Template Plan

## Demo Goal

Show a complete path from editing a generated quest in the web UI to pushing an exported quest file into a Git repository in a selected format.

Target demo story:

1. User configures a quest export template under Settings.
2. User creates a questline from a story prompt.
3. User chooses one configured template during creation.
4. AI uses the chosen template as context when extracting objectives and rewards.
5. Generated questline is opened in Quest Builder.
6. User edits at least one quest node in the UI.
7. User opens Export.
8. User selects asset categories to export, such as quests, NPCs, rewards, and objectives.
9. User selects an export format/template.
10. User clicks Push to Git.
11. Exported files appear in the configured Git repository.

## Current State Observed

Existing pieces:

- Backend has export template persistence:
  - `backend/src/models/exportTemplateModel.ts`
  - `backend/src/controllers/exportTemplateController.ts`
  - `backend/src/routes/exportTemplateRoute.ts`
- Export templates already support built-in and user-owned templates.
- Frontend has `frontend/src/app/api/exportTemplateApi.ts`.
- Quest creation `StepOutput` already loads templates, previews template-applied JSON, saves a copy of a template, and deletes custom templates.
- Quest generation already has multi-step flow:
  - story input
  - style selection
  - objectives/rewards selection
  - characters selection
  - final questline generation
- Backend quest generation already accepts story, genre, objectives, rewards, characters, and style.

Missing or incomplete pieces on the current branch:

- No Settings route/page is present in `frontend/src/app/App.tsx`.
- No Settings UI for managing export templates is present.
- Template choice is currently late in `StepOutput`, not under the story textbox.
- Selected template is not sent to the objective/reward generation endpoint.
- Selected template is not persisted on the generated questline.
- Export dialog and Git push UI are not present on the current branch.
- Backend export templates are not yet connected to final questline export.
- Asset-category filtering is not modeled in the export pipeline.

## Phase 1: Define The Demo Contract

Create one demo template format and use it throughout the first demo.

Example demo template name:

```text
Professor Quest Template
```

Required template capabilities:

- Defines final export shape.
- Declares asset categories:
  - quests
  - NPCs
  - rewards
  - objectives
  - edges
  - chapters
- Declares placeholder fields the app can fill.
- Can be previewed before export.
- Can be used as AI context during objective/reward extraction.

Suggested template schema:

```json
{
  "name": "Professor Quest Template",
  "engine": "custom-json",
  "assetCategories": ["quests", "npcs", "rewards", "objectives", "edges"],
  "structure": {
    "QuestPackage": {
      "QuestInfo": {
        "Id": "{{id}}",
        "Title": "{{title}}",
        "Genre": "{{genre}}"
      },
      "Quests": "{{nodes}}",
      "NPCs": "{{characters}}",
      "Rewards": "{{rewards}}",
      "Objectives": "{{objectives}}",
      "Links": "{{edges}}"
    }
  },
  "aiHints": {
    "objectiveStyle": "Use objective types that match the template's Objectives section.",
    "rewardStyle": "Use reward types that match the template's Rewards section."
  }
}
```

Review questions:

- Should templates be JSON only for the demo, or should XML upload also be accepted?
- Should templates store `aiHints` explicitly, or should hints be inferred from the uploaded structure?
- Should a template be allowed to define multiple output files, or only one file for the first demo?

## Phase 2: Backend Template Model

Extend export templates to support generation and export metadata.

Current model fields:

```text
ownerId
name
engine
isBuiltIn
structure
```

Proposed fields:

```text
description?: string
assetCategories?: string[]
aiHints?: {
  objectiveStyle?: string
  rewardStyle?: string
  structureSummary?: string
}
output?: {
  extension: string
  mimeType: string
  mode: "json" | "xml" | "img"
}
```

Implementation tasks:

1. Add fields to `ExportTemplateSchema`.
2. Keep old templates backward-compatible by defaulting:
   - `assetCategories` to all categories
   - `output.extension` from `engine` or `.json`
3. Add validation in `exportTemplateController.create`.
4. Add `PUT /export-templates/:id` for editing templates.
5. Add ownership checks for update and delete.
6. Add a small helper that normalizes template records for frontend use.

Acceptance criteria:

- Existing built-in templates still load.
- User-created templates can include `assetCategories` and `aiHints`.
- Invalid template uploads return a useful error.

## Phase 3: Settings Page Template Manager

Create a Settings page and add template management under it.

Files to add:

```text
frontend/src/app/pages/Settings/Settings.tsx
frontend/src/app/pages/Settings/components/QuestTemplateSettingsCard.tsx
frontend/src/app/pages/Settings/components/TemplateUploadModal.tsx
```

Routing tasks:

1. Add Settings route in `App.tsx`.
2. Add Settings navigation item in `TopNav.tsx`.

Template UI tasks:

1. Show list of built-in and user templates.
2. Allow upload/paste of template JSON.
3. Let user give each template a name.
4. Validate template before saving.
5. Show detected asset categories.
6. Allow delete/edit for custom templates.
7. Show read-only badge for built-in templates.

Suggested UI fields:

- Template name
- Template engine/type
- File extension
- Asset categories checkboxes
- Raw JSON editor or upload box
- Validation status

Acceptance criteria:

- User can create a template from Settings.
- Template appears later in Create flow.
- Bad JSON does not save.
- Built-in templates remain available.

## Phase 4: Template Dropdown Under Story Input

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
selectedTemplateId: string;
selectedTemplateSnapshot?: ExportTemplate;
```

UI changes:

1. Under the story textbox, add template dropdown.
2. Load templates on QuestCreate mount.
3. Default to "No template" or the built-in QuestFlow template.
4. Show template description/categories beneath dropdown.
5. Keep genre chips below the template selector.

Acceptance criteria:

- User sees templates created in Settings.
- User can create without choosing a template.
- Selected template stays selected through all creation steps.

## Phase 5: Send Template To Objective/Reward AI

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
    assetCategories?: string[];
    aiHints?: object;
  };
}
```

Backend behavior:

1. If `templateId` is provided, load the template and verify:
   - built-in, or
   - owned by current user.
2. Summarize the template structure for the prompt.
3. Ask AI to infer objectives and rewards that fit the template categories.
4. If no template is supplied, keep the current story-only generation behavior.

Prompt requirements:

- Do not copy placeholder names as final objective/reward names.
- Use the template to understand expected categories.
- Still return 3 to 7 objectives and 3 to 7 rewards.
- Still return valid JSON only.

Acceptance criteria:

- Template-aware generation produces objectives/rewards shaped toward the template.
- No-template flow still works.
- Unauthorized template ID is rejected.

## Phase 6: Persist Template Choice On Questline

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

## Phase 7: Quest Builder Edit Demo

Make sure the edit path is demo-ready.

Demo action:

1. Open generated questline.
2. Click one node.
3. Edit title/body/variant or linked NPC/reward.
4. Save graph.

Existing areas to verify:

```text
frontend/src/app/pages/QuestBuilder/QuestBuilder.tsx
frontend/src/app/pages/QuestBuilder/components/NodeEditSidebar.tsx
backend/src/controllers/questlineController.ts
```

Acceptance criteria:

- Edited node persists after refresh.
- Export uses edited values, not stale generation values.

## Phase 8: Export Dialog With Asset Categories

Add asset-category selection to export.

UI requirements:

- Show categories grouped as:
  - Quests
  - NPCs
  - Rewards
  - Objectives
  - Edges
  - Chapters
- Each category has a checkbox.
- User can select all/none.
- Template-selected categories default to checked.
- Export preview updates when categories change.

Backend export request:

```text
GET /questlines/:id/export/preview?format=template-json&templateId=...&categories=quests,npcs,rewards
GET /questlines/:id/export?format=template-json&templateId=...&categories=quests,npcs,rewards
```

Backend tasks:

1. Add category filter to canonical export builder or export renderer.
2. Do not delete data from the database; filter only export output.
3. Template renderer receives:
   - canonical export payload
   - selected categories
   - template snapshot

Acceptance criteria:

- Unchecked category does not appear in exported file.
- Checked categories export in the chosen template format.
- Preview matches downloaded file.

## Phase 9: Push To Git

Create or restore Git push flow for the demo.

Required UI:

- Button: `Push to Git`
- Repository owner/name
- Branch
- Destination path
- Commit message
- Selected format/template

Backend requirements:

- Store Git token securely in Settings.
- Push exported content to configured repository.
- Support the selected template format.
- Return final repository path to UI.

Suggested endpoints:

```text
GET /user-settings/git
PUT /user-settings/git
POST /questlines/:id/push-to-github
```

Demo acceptance criteria:

- User clicks Push to Git.
- Git repository receives a new file.
- File content matches the export preview.
- Commit message is readable.

## Phase 10: Professor Demo Script

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
11. Select asset categories.
12. Preview export.
13. Push to Git.
14. Open Git repository and show file.

Backup plan:

- Keep a pre-created questline ready.
- Keep a pre-saved template ready.
- Keep Git settings preconfigured.
- If AI is slow, start from the pre-created questline and show export/push.

## Review Checklist

- Confirm desired export file extension.
- Confirm whether template upload is JSON-only for demo.
- Confirm exact asset categories.
- Confirm Git provider is GitHub only.
- Confirm whether generated sprites/images are part of the demo export.
- Confirm first demo template example.
- Confirm whether template should affect only objectives/rewards or also full questline generation.
