# Questline roster sync is additive-only

A questline holds a **roster** (`characterIds` / `itemIds`) separate from per-node references (`node.npcIds / monsterIds / rewardIds`). On save, `saveGraph` reconciles node references *into* the roster so anything attached to a node also appears in the Builder's shelves (and in exports / AI-edit context, which read the roster directly).

We decided this reconciliation is **additive-only**: it adds referenced designs to the roster but never removes. Detaching a design from its last node leaves it on the roster.

## Why

- The roster is the questline's *cast/loot list* — a design can belong to the questline's world without being pinned to a node. Two-way sync would silently drop a design from the roster on an unrelated edge deletion, which is surprising data loss.
- Additive-only can never cause a destructive surprise from a routine graph edit.
- Removal stays an explicit act (the shelf's trash button — which deletes the design project-wide, not just from this roster).

## Consequence

Because sync never auto-removes, authors need an explicit "remove from this questline" control. This is now the meaning of the Builder shelf's trash button: it **detaches** a character/item from the questline (`$pull` from the roster and from node references) but keeps the project-scoped design. A real, project-wide delete lives only on the Project/Studio pages (`DELETE /characters/:id`, `DELETE /items/:id`).
