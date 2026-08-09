# QuestFlow

A quest-authoring tool: users build branching questlines on a node graph, and design the game assets (characters, monsters, items) those quests reference.

## Language

### Designs (project-scoped source of truth)

**Character**:
A project-scoped design document for an in-world figure, of one **kind**: an NPC or a monster. It is the single source of truth — questlines and nodes only ever *reference* it by id, never copy it. Lives in the Studio.
_Avoid_: NPC (that is one kind of character), cast member

**Item**:
A project-scoped design document for a piece of loot/equipment. Single source of truth, referenced by id — the item model mirrors Character exactly. Lives in the Studio.

**Kind**:
The discriminator on a Character: `npc` or `monster`. The Quest Builder surfaces the two kinds as separate shelves ("Characters" and "Mobs").

**Studio**:
The design surface where Characters and Items are created and given sprites. Distinct from the Quest Builder, which only references designs.

### Questline references

**Questline**:
A graph of quest **nodes** with a **roster** of the Characters and Items it uses.

**Roster**:
The set of design references a questline holds: `questline.characterIds` (its cast) and `questline.itemIds` (its loot). Populated by AI generation, by an author adding "from Studio", and (as of this work) by reconciling node references on save. Additive-only: syncing never removes a design from the roster. What the Quest Builder's Characters / Mobs / Items shelves display.
_Avoid_: cast (roster covers items too), library

**Reward**:
The legacy wire name for an Item as it appears on a questline — a roster item surfaced through the `/questlines/:id/rewards` endpoints. A Reward is not its own document; it is a *view* of an Item (`{ title, description, rarity, itemId }`).
_Avoid_: treating a reward as a separate entity from the item it references

**Node reference**:
A design id pinned to a specific quest node: `node.npcIds`, `node.monsterIds`, `node.rewardIds`. A node reference means "this character/item appears in this quest step." Distinct from roster membership: a design can be on the roster without being on any node.
_Avoid_: cast (the ban under Roster applies here too — these cover items as well as figures)

**Add from Studio**:
The author action that adds an existing project design to a questline's roster without pinning it to any node. Exists today for Items; being extended to Characters and Mobs.

**Focus node**:
The single node an AI edit is scoped to. A focused edit may only rewrite that node; the rest of the graph is context, not a target. Distinct from an unfocused edit, which may touch any node and rewire the graph.

### Knowledge base

**Game**:
A world that owns a knowledge base. Shared across projects — a Project or a Questline *links* to a Game, and the questline's link wins over its project's. Not the same thing as a Project: a Project holds designs, a Game holds source material about the world those designs live in.
_Avoid_: world, KB (that is what the Game owns, not the Game itself)

**Knowledge base**:
The source material an author has ingested about a Game — lore, bestiaries, item tables, maps. Read-only to generation: it *guides* what the AI writes and is never an allowlist. A questline with no linked Game generates ungrounded, which is the normal case, not a failure.

**KB entity**:
One named thing inside the knowledge base — a specific monster, character, or item. Distinct from a design: a KB entity is *reference material about* the world; a design is a project-scoped document an author can edit and give a sprite to. A KB entity has no existence in a project until it is materialized.

**Materialize**:
Turning a KB entity, or an AI proposal, into a real project-scoped design. This is the only way something in a knowledge base becomes editable, spriteable, or attachable to a node.

**Grounded**:
Said of a design that records which KB entity it came from. Grounded is a claim about *provenance*, not quality — an invented design is not lesser, it simply has no KB entity behind it. Surfaced to authors as a badge wherever a design is chosen or reviewed.

**Proposed design**:
A design the AI has suggested but that does not exist yet — it has a name and description but no document and no id. Becomes a design only when the author approves the change that introduced it. Until then it can be rejected and leaves nothing behind.
