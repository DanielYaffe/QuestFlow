# Professor Demo Export Template Plan

## Demo Goal

Show a complete path from editing a generated quest in the web UI to pushing exported questline files into a Git repository in a selected format.

Target demo story:

1. User optionally configures a quest export template under Settings.
2. User creates a questline from a story prompt.
3. User chooses one configured template during creation, or leaves the selector on "No template".
4. If a template is chosen, AI uses it as context when extracting objectives and rewards.
5. If no template is chosen, AI keeps the current story-only behavior and creates objectives/rewards from the story.
6. Generated questline is opened in Quest Builder.
7. User edits at least one quest node in the UI.
8. User opens Export.
9. User selects game asset categories to export, such as Quests and NPCs.
10. User selects quest data sections, such as objectives and rewards, inside the Quest asset.
11. User selects an export format/template.
12. User selects a destination root folder.
13. User clicks Push to Git.
14. Exported files appear under a questline-specific folder inside the selected repository folder.

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
- Export dialog does not have game asset category filtering.
- Current GitHub push writes one exported file to the selected path; it does not create a separate folder per questline.
- Backend export templates are not yet connected to final questline export.
- Game asset category filtering is not modeled in the export pipeline.

## Phase 1: Define The Demo Contract

Create one demo template format and use it throughout the first demo.

Example demo template name:

```text
Professor Quest Template
```

Required template capabilities:

- Defines final export shape.
- Declares top-level game asset categories:
  - quests
  - NPCs
- Declares Quest asset sections:
  - objectives
  - rewards
  - nodes/steps
  - edges
  - chapters
- Treats objectives and rewards as part of the Quest asset, not as standalone game assets.
- Declares placeholder fields the app can fill.
- Can be previewed before export.
- Can be used as AI context during objective/reward extraction.
- Defines what happens when no template is selected: use normal story-only generation and a default export format.

Suggested template schema:

```json
{
  "name": "Professor Quest Template",
  "engine": "custom-json",
  "gameAssetCategories": ["quests", "npcs"],
  "questSections": ["objectives", "rewards", "nodes", "edges", "chapters"],
  "folderStrategy": "questline-folder",
  "structure": {
    "QuestPackage": {
      "Quest": {
        "Id": "{{id}}",
        "Title": "{{title}}",
        "Genre": "{{genre}}",
        "Steps": "{{nodes}}",
        "Objectives": "{{objectives}}",
        "Rewards": "{{rewards}}",
        "Links": "{{edges}}",
        "Chapters": "{{chapters}}"
      },
      "NPCs": "{{characters}}"
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
- What should the default export format be when the user chooses "No template"?

## Phase 2: Backend Template Model

Add export templates to support generation and export metadata on top of `feat/quest-export-github-push`.

Initial model fields:

```text
ownerId?
name
engine
isBuiltIn
structure
description?: string
gameAssetCategories?: string[]
questSections?: string[]
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

1. Add `ExportTemplateSchema`, model, controller, and route.
2. Add frontend API helpers for export templates.
3. Default missing values:
   - `gameAssetCategories` to `["quests", "npcs"]`
   - `questSections` to `["objectives", "rewards", "nodes", "edges", "chapters"]`
   - `output.extension` from `engine` or `.json`
4. Add validation in `exportTemplateController.create`.
5. Add `PUT /export-templates/:id` for editing templates.
6. Add ownership checks for update and delete.
7. Add a small helper that normalizes template records for frontend use.

Acceptance criteria:

- Built-in templates load for every user.
- User-created templates can include `gameAssetCategories`, `questSections`, and `aiHints`.
- Invalid template uploads return a useful error.

## Phase 3: Settings Page Template Manager

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
2. Allow upload/paste of template JSON.
3. Let user give each template a name.
4. Validate template before saving.
5. Show detected game asset categories.
6. Show detected Quest asset sections.
7. Allow delete/edit for custom templates.
8. Show read-only badge for built-in templates.

Suggested UI fields:

- Template name
- Template engine/type
- File extension
- Game asset category checkboxes
- Quest section checkboxes
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
selectedTemplateId?: string;
selectedTemplateSnapshot?: ExportTemplate;
```

UI changes:

1. Under the story textbox, add template dropdown.
2. Load templates on QuestCreate mount.
3. Default to "No template".
4. Show template description/categories beneath dropdown.
5. Keep genre chips below the template selector.
6. When "No template" is selected, do not send template data to the AI.

Acceptance criteria:

- User sees templates created in Settings.
- User can create without choosing a template.
- Selected template stays selected through all creation steps.
- No-template creation produces objectives/rewards from the story only.

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
    gameAssetCategories?: string[];
    questSections?: string[];
    aiHints?: object;
  };
}
```

Backend behavior:

1. If `templateId` is provided, load the template and verify:
   - built-in, or
   - owned by current user.
2. Summarize the template structure for the prompt.
3. Ask AI to infer objectives and rewards that fit the template's Quest sections.
4. If no template is supplied, keep the current story-only generation behavior.

Prompt requirements:

- Do not copy placeholder names as final objective/reward names.
- Use the template to understand expected Quest sections and level of detail.
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

## Phase 8: Export Dialog With Game Asset Categories

Add game asset category selection to export.

UI requirements:

- Show top-level game asset categories:
  - Quests
  - NPCs
- When Quests is selected, show Quest asset sections:
  - Steps/Nodes
  - Rewards
  - Objectives
  - Edges
  - Chapters
- Treat rewards and objectives as Quest asset sections, not standalone game assets.
- Each game asset category has a checkbox.
- Each Quest section has a checkbox inside the Quest category.
- User can select all/none.
- Template-selected game asset categories and Quest sections default to checked.
- Export preview updates when categories change.
- Show the target folder layout before pushing.

Backend export request:

```text
GET /questlines/:id/export/preview?format=template-json&templateId=...&gameAssets=quests,npcs&questSections=objectives,rewards,nodes,edges,chapters
GET /questlines/:id/export?format=template-json&templateId=...&gameAssets=quests,npcs&questSections=objectives,rewards,nodes,edges,chapters
```

Backend tasks:

1. Add game asset and Quest section filters to the canonical export builder or export renderer.
2. Do not delete data from the database; filter only export output.
3. If `quests` is unchecked, do not export the Quest asset.
4. If `quests` is checked, apply Quest section filters inside that Quest asset.
5. Template renderer receives:
   - canonical export payload
   - selected game asset categories
   - selected Quest sections
   - template snapshot

Acceptance criteria:

- Unchecked game asset category does not appear in exported output.
- Unchecked Quest section does not appear inside the Quest asset.
- Checked game asset categories export in the chosen template format.
- Preview matches downloaded file.

## Phase 9: Push To Git

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
- For single-file exports, push to `<root>/<questline-folder>/<filename>`.
- For multi-file/template exports, push files under `<root>/<questline-folder>/quests`, `<root>/<questline-folder>/npcs`, and similar folders.
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
- Exported content matches the export preview.
- Commit message is readable.
- If no template was chosen, push still works using the selected standard export format.

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
11. Select game asset categories.
12. Select Quest asset sections.
13. Confirm the questline folder path.
14. Preview export.
15. Push to Git.
16. Open Git repository and show the questline folder.

Backup plan:

- Keep a pre-created questline ready.
- Keep a pre-saved template ready.
- Keep Git settings preconfigured.
- If AI is slow, start from the pre-created questline and show export/push.

## Review Checklist

- Confirm desired export file extension.
- Confirm whether template upload is JSON-only for demo.
- Confirm exact top-level game asset categories.
- Confirm exact Quest asset sections.
- Confirm Git provider is GitHub only.
- Confirm whether generated sprites/images are part of the demo export.
- Confirm first demo template example.
- Confirm whether template should affect only objectives/rewards or also full questline generation.
