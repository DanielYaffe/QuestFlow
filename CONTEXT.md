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

**Add from Studio**:
The author action that adds an existing project design to a questline's roster without pinning it to any node. Exists today for Items; being extended to Characters and Mobs.
