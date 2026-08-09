<!-- @format -->

# MapleStory v83 Native Asset Structure

## Canonical Client Folder

Use this client-side folder as the source of truth:

```text
C:\Users\amits\Desktop\games\Maples\Contabo\Data
```

Top-level folders observed:

```text
Character/
Effect/
Etc/
Item/
Map/
Mob/
Morph/
Npc/
Quest/
Reactor/
Skill/
Sound/
String/
TamingMob/
Ui/
```

The client uses folder names such as `Npc`, `Item`, and `String`, not root-level `Npc.wz` folders in this exported layout.

## NPC Target Files

NPC client asset files live under:

```text
Data/Npc/<npc-id-padded-to-7-digits>.img
```

Examples:

```text
Data/Npc/0002000.img
Data/Npc/1001000.img
Data/Npc/9970000.img
```

NPC string records live under:

```text
Data/String/Npc.img
```

## Minimal Custom NPC Structure

Two existing custom NPC XML previews were found:

```text
Data/Npc/9970000.img.xml
Data/Npc/9970001.img.xml
```

They both use this minimal structure:

```xml
<imgdir name="9970000.img">
  <imgdir name="info">
    <imgdir name="speak">
      <string name="0" value="n0"/>
      <string name="1" value="n1"/>
    </imgdir>
  </imgdir>
  <imgdir name="stand">
    <canvas name="0" width="45" height="68">
      <vector name="origin" x="22" y="68"/>
    </canvas>
  </imgdir>
</imgdir>
```

Current implementation target for first demo:

- one static in-world NPC frame
- `stand/0` canvas
- canvas size `45x68`
- origin `22,68`
- `info/speak` entries pointing to `n0`, `n1`
- matching `Data/String/Npc.img` entry with `name` and default speech strings.

Open validation task:

- Confirm whether the client needs any additional properties for all map placements, shops, or scripted NPCs.

## ETC Item Target Files

ETC item assets live under grouped files:

```text
Data/Item/Etc/<group>.img
```

Observed examples:

```text
Data/Item/Etc/0400.img
Data/Item/Etc/0401.img
Data/Item/Etc/0402.img
```

For an item ID like `4000002`, the target group file is expected to be:

```text
Data/Item/Etc/0400.img
```

ETC item string records live under:

```text
Data/String/Etc.img
```

Current implementation target for first demo:

- ETC item only
- normalized icon PNG
- generated metadata entry
- matching string entry with `name` and `desc`

Open validation task:

- Export/read back a native ETC item XML example and confirm exact fields for icon/canvas and metadata.

## ID Rules

QuestFlow must validate IDs against:

- configured project custom ranges
- project-created assets
- native KB data linked to the project

Native collision behavior:

- block by default
- allow only when the asset is marked as an intentional `patch`
- show the native object name if known.

## Deployment Shape

CI/CD should publish HFS output in the same shape as the client `Data` folder:

```text
remote-update-root/
  manifest.json
  Data/
    Npc/
    Item/
      Etc/
    String/
```

Changed-only deployment compares the current package manifest with the last deployed manifest.

## Current QuestFlow Package Flow

The Studio page exports only a deterministic source package for the external
Maple v83 builder/deployer:

- `Changed only`: includes assets whose current package hash differs from the
  last exported/deployed manifest.
- `Full snapshot`: includes every Maple-enabled NPC and ETC item in the active
  project.

The app endpoint is:

```text
POST /maple-assets/projects/:projectId/package
```

QuestFlow does not create final `.img` files, merge WZ files, write server WZ
XML, or publish to HFS. Those steps belong to the external deployer.

The downloaded package contains `manifest` plus normalized source files:

```text
maple-build.json
  manifest
  files[]
```

When expanded, it should look like:

```text
maple-build/
  manifest.json
  npcs/
    <npc-id>/
      npc.json
      sprite.png
      frames.json
  items/
    <item-id>/
      item.json
      icon.png
```

Each manifest asset lists intended native targets with both client and server
paths, for example:

```text
client/Data/Npc/<id>.img
client/Data/String/Npc.img
server/wz/Npc.wz/<id>.img.xml
server/wz/String.wz/Npc.img.xml
```

The external deployer should read those targets, generate/merge the appropriate
native client files, generate/merge server WZ XML when needed, then publish the
HFS-ready `Data/` output.

Open merge work:

- `Data/Npc/<id>.img` is safe to create as a standalone generated NPC file.
- grouped/native files such as `Data/Item/Etc/<group>.img` must be merged with existing native/generated entries before replacing live client data.
- string records such as `Data/String/Npc.img` and `Data/String/Etc.img` still need merge output so generated names/descriptions appear in-game.
