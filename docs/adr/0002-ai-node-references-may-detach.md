# AI-proposed node references may detach, while roster sync stays additive

AI edits to a questline can change a node's **node references** (`node.npcIds` / `monsterIds` / `rewardIds`). The proposal carries these as a `refs` block with **before and after** arrays, exactly like `title` and `body` — so an AI edit can remove a character from a node, not only add one.

This reads as a contradiction of [ADR-0001](./0001-additive-only-roster-sync.md), which made roster reconciliation additive-only. It is not: the two rules govern different things, and they compose.

- **Node references may shrink.** "Replace the bandit ambush with a dragon" is one instruction and should be one reviewable change, not an attach the author accepts followed by a detach they perform by hand.
- **The roster still never shrinks.** Detaching a character from its last node leaves it on the questline's shelves. The questline's cast/loot list is a statement about the questline's world, not a derived index of what is currently pinned.

So an AI edit can empty a node and the design still sits in the roster, one click from being re-pinned. Nothing an AI edit does can remove a design from the questline or the project.

## The guard is the review diff, not the server

We considered validating the AI's `before` against the live graph server-side and dropping the `refs` block on mismatch. We chose not to. Both surfaces that apply an AI edit already diff node references before anything is written:

- The AI panel renders per-change cards the author approves or rejects individually.
- The node editor routes AI suggestions into draft state behind its existing Review Changes step, which already diffs NPCs, Monsters and Rewards.

A server guard would add a rejection path whose failure mode — a change that silently arrives with its `refs` stripped — is harder to understand than the thing it prevents.

## Consequences

- A hallucinated-empty `after` reaches the author as a visible removal diff. That diff must therefore be **unconditionally rendered whenever the list changed**. The node editor previously showed the NPC and Monster diffs mutually exclusively based on the node's variant, which would hide a removal on any edit that also flipped the variant. That gating is removed.
- Nothing outside a review surface may apply an AI `refs` block. Any future path that applies AI edits without a diff has to bring its own guard, or this decision has to be revisited.
- Approving a change that introduces a **proposed design** materializes it. Undo reverts the graph but keeps the design, per ADR-0001's rule that removal is always an explicit act.