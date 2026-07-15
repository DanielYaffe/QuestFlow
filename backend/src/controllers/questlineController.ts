import { Request, Response } from 'express';
import BaseController from './baseController';
import QuestlineModel, { BASE_VARIANTS } from '../models/questlineModel';
import CharacterModel from '../models/characterModel';
import ExportTemplateModel from '../models/exportTemplateModel';
import { resolveProjectId } from '../models/projectModel';
import { AuthRequest } from '../middlewares/authMiddleware';
import { getPresignedUrl } from '../utils/s3Helper';
import { getProjectId } from '../utils/projectScope';
import { IQuestNodeExportFields } from '../models/questlineModel';
import { ownsGame } from '../services/gameService';

// S3 keys never start with http — presigned URLs always do
function isS3Key(value: string): boolean {
  return !!value && !value.startsWith('http');
}

function defaultQuestId(nodeId: string): number {
  const numeric = parseInt(nodeId, 10);
  return Number.isFinite(numeric) ? numeric : Math.abs([...nodeId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0));
}

function normalizeExportFields(
  nodeId: string,
  raw?: Partial<IQuestNodeExportFields>,
  incomingPreQuest: number[] = [-1],
): IQuestNodeExportFields {
  return {
    questId: raw?.questId ?? defaultQuestId(nodeId),
    silent: raw?.silent ?? true,
    preQuest: raw?.preQuest?.length ? raw.preQuest : incomingPreQuest,
    daily: raw?.daily ?? false,
    toKill: (raw?.toKill ?? []).map((target) => ({
      id: Number(target.id) || 0,
      amount: Number(target.amount) || 0,
    })).filter((target) => target.id > 0 && target.amount > 0),
    toCollect: (raw?.toCollect ?? []).map((target) => ({
      itemId: Number(target.itemId) || 0,
      amount: Number(target.amount) || 0,
    })).filter((target) => target.itemId > 0 && target.amount > 0),
    rewardItems: (raw?.rewardItems ?? []).map((item) => ({
      id: Number(item.id) || 0,
      amount: Number(item.amount) || 0,
    })).filter((item) => item.id > 0 && item.amount > 0),
  };
}

// Resolve a display image for a Character: explicit portrait, else canonical
// snapped sprite, else most recent raw candidate. Presign S3 keys.
async function signCharacterPreview(c: {
  portraitUrl?: string;
  assets?: { snappedSpriteS3Key?: string; rawSpriteCandidates?: string[] };
}): Promise<string> {
  const candidates = c.assets?.rawSpriteCandidates ?? [];
  const candidate = c.portraitUrl || c.assets?.snappedSpriteS3Key || candidates[candidates.length - 1] || '';
  if (!candidate) return '';
  return isS3Key(candidate) ? getPresignedUrl(candidate) : candidate;
}

class QuestlineController extends BaseController {
  constructor() {
    super(QuestlineModel);
  }

  // GET /questlines?projectId= — only return metadata for questlines owned by the
  // authenticated user, optionally scoped to a project.
  async get(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    const projectId = getProjectId(req);
    try {
      const filter: Record<string, unknown> = { ownerId: userId };
      if (projectId) filter.projectId = projectId;
      const questlines = await QuestlineModel.find(filter)
        .select('title description ownerId projectId createdAt updatedAt');
      res.json(questlines);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // POST /questlines — set ownerId from JWT; default projectId to the user's Inbox
  async create(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    req.body.ownerId = userId;
    req.body.projectId = await resolveProjectId(userId, getProjectId(req) || req.body.projectId);
    return super.create(req, res);
  }

  // PUT /questlines/:id — only owner can update title/description
  async put(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const questline = await QuestlineModel.findById(req.params.id);
      if (!questline) {
        res.status(404).json({ error: 'Questline not found' });
        return;
      }
      if (questline.ownerId !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const { gameId } = req.body as { gameId?: string };
      // '' clears the per-questline KB override; a non-empty id must be owned.
      if (gameId !== undefined && gameId !== '' && !(userId && await ownsGame(userId, gameId))) {
        res.status(403).json({ error: 'Game not found or not owned by you' });
        return;
      }
      super.put(req, res);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // DELETE /questlines/:id — deletes the document and all embedded data automatically
  async delete(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const questline = await QuestlineModel.findById(req.params.id);
      if (!questline) {
        return res.status(404).json({ error: 'Questline not found' });
      }
      if (questline.ownerId !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      await QuestlineModel.findByIdAndDelete(req.params.id);
      return res.json({ message: 'Questline deleted' });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // ── Graph ────────────────────────────────────────────────────────────────

  // GET /questlines/:id/graph
  async getGraph(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const questline = await QuestlineModel.findById(req.params.id).select('ownerId nodes edges rewards templateId templateName templateSnapshot');
      if (!questline) {
        res.status(404).json({ error: 'Questline not found' });
        return;
      }
      if (questline.ownerId !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const numericIds = questline.nodes
        .map((n) => parseInt(n.nodeId, 10))
        .filter((n) => !isNaN(n));
      const nextNodeId = numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1;

      // Rewards are still embedded, so a node may carry a stale "rew-N" temp id
      // from before the reward ID-remapping fix. Character ids are already real
      // Character _ids (the backfill migration remaps any legacy "char-N").
      const staleRewardMap = new Map<string, string>(); // "rew-1" → mongo _id
      questline.rewards.forEach((r, i) => staleRewardMap.set(`rew-${i + 1}`, r._id.toString()));
      const remapReward = (id: string): string => staleRewardMap.get(id) ?? id;

      const questIdByNodeId = new Map<string, number>();
      questline.nodes.forEach((n) => {
        questIdByNodeId.set(n.nodeId, n.exportFields?.questId ?? defaultQuestId(n.nodeId));
      });

      const preQuestByNodeId = new Map<string, number[]>();
      questline.edges.forEach((edge) => {
        const sourceQuestId = questIdByNodeId.get(edge.source) ?? defaultQuestId(edge.source);
        const current = preQuestByNodeId.get(edge.target) ?? [];
        preQuestByNodeId.set(edge.target, [...current, sourceQuestId]);
      });

      const shapedNodes = questline.nodes.map((n) => ({
        id: n.nodeId,
        type: n.type,
        data: {
          title:      n.title,
          body:       n.body,
          variant:    n.variant,
          npcIds:     n.npcIds     ?? [],
          monsterIds: n.monsterIds ?? [],
          rewardIds:  (n.rewardIds ?? []).map(remapReward),
          exportFields: normalizeExportFields(n.nodeId, n.exportFields, preQuestByNodeId.get(n.nodeId)),
          templateValues: n.templateValues ?? {},
        },
      }));

      const shapedEdges = questline.edges.map((e) => ({
        id: e.edgeId,
        source: e.source,
        target: e.target,
      }));
      const latestTemplate = questline.templateId
        ? await ExportTemplateModel.findOne({
          _id: questline.templateId,
          $or: [{ isBuiltIn: true }, { ownerId: userId }],
        }).lean()
        : null;
      const templateSnapshot = latestTemplate ? {
        id: latestTemplate._id.toString(),
        name: latestTemplate.name,
        rawTemplate: latestTemplate.rawTemplate,
        structure: latestTemplate.structure,
        templateAst: latestTemplate.templateAst,
        defaultOutputFormat: latestTemplate.defaultOutputFormat,
        fieldSchema: latestTemplate.fieldSchema,
        templateSchema: latestTemplate.templateSchema,
        schemaSummary: latestTemplate.schemaSummary,
        analysisStatus: latestTemplate.analysisStatus,
        inferredAiGuidance: latestTemplate.inferredAiGuidance,
      } : questline.templateSnapshot;

      res.json({
        nodes: shapedNodes,
        edges: shapedEdges,
        nextNodeId,
        template: questline.templateId ? {
          id: questline.templateId,
          name: latestTemplate?.name ?? questline.templateName,
          snapshot: templateSnapshot,
        } : null,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // PUT /questlines/:id/graph — replace all nodes + edges
  async saveGraph(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const questline = await QuestlineModel.findById(req.params.id);
      if (!questline) {
        res.status(404).json({ error: 'Questline not found' });
        return;
      }
      if (questline.ownerId !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const { nodes, edges } = req.body as {
        nodes: { id: string; type?: string; data: { title: string; body: string; variant?: string; npcIds?: string[]; monsterIds?: string[]; rewardIds?: string[]; exportFields?: Partial<IQuestNodeExportFields>; templateValues?: Record<string, unknown> } }[];
        edges: { id: string; source: string; target: string }[];
      };

      const incomingPreQuestByNodeId = new Map<string, number[]>();
      const rawQuestIdByNodeId = new Map<string, number>();
      (nodes ?? []).forEach((node) => {
        rawQuestIdByNodeId.set(node.id, node.data.exportFields?.questId ?? defaultQuestId(node.id));
      });
      (edges ?? []).forEach((edge) => {
        const sourceQuestId = rawQuestIdByNodeId.get(edge.source) ?? defaultQuestId(edge.source);
        const current = incomingPreQuestByNodeId.get(edge.target) ?? [];
        incomingPreQuestByNodeId.set(edge.target, [...current, sourceQuestId]);
      });

      await QuestlineModel.findByIdAndUpdate(req.params.id, {
        nodes: (nodes ?? []).map((n) => ({
          nodeId:     n.id,
          type:       n.type ?? 'questNode',
          title:      n.data.title,
          body:       n.data.body,
          variant:    n.data.variant ?? 'story',
          npcIds:     n.data.npcIds     ?? [],
          monsterIds: n.data.monsterIds ?? [],
          rewardIds:  n.data.rewardIds  ?? [],
          exportFields: normalizeExportFields(n.id, n.data.exportFields, incomingPreQuestByNodeId.get(n.id)),
          templateValues: n.data.templateValues ?? {},
        })),
        edges: (edges ?? []).map((e) => ({
          edgeId: e.id,
          source: e.source,
          target: e.target,
        })),
      });

      res.json({ message: 'Graph saved' });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // ── Variants ─────────────────────────────────────────────────────────────

  // GET /questlines/:id/variants
  async getVariants(req: AuthRequest, res: Response) {
    try {
      const questline = await QuestlineModel.findById(req.params.id).select('ownerId variants');
      if (!questline) {
        res.status(404).json({ error: 'Questline not found' });
        return;
      }
      res.json({
        base: BASE_VARIANTS,
        custom: questline.variants.map((v) => ({ id: v._id, name: v.name, color: v.color })),
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // POST /questlines/:id/variants
  async createVariant(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const questline = await QuestlineModel.findById(req.params.id);
      if (!questline) {
        res.status(404).json({ error: 'Questline not found' });
        return;
      }
      if (questline.ownerId !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      questline.variants.push(req.body);
      await questline.save();
      const created = questline.variants[questline.variants.length - 1];
      res.status(201).json(created);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // DELETE /questlines/:id/variants/:variantId
  async deleteVariant(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const questline = await QuestlineModel.findById(req.params.id);
      if (!questline) {
        res.status(404).json({ error: 'Questline not found' });
        return;
      }
      if (questline.ownerId !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const before = questline.variants.length;
      questline.variants = questline.variants.filter(
        (v) => v._id.toString() !== req.params.variantId,
      ) as typeof questline.variants;
      if (questline.variants.length === before) {
        res.status(404).json({ error: 'Variant not found' });
        return;
      }
      await questline.save();
      res.json({ message: 'Variant deleted' });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // ── Characters ────────────────────────────────────────────────────────────
  // Characters live in the standalone Character collection (single source of
  // truth). These questline-scoped endpoints read/write that collection via the
  // questline's characterIds, shaped to the legacy wire contract the QuestBuilder
  // sidebar consumes ({ _id, name, appearance, background, imageUrl, questIds }).

  // GET /questlines/:id/characters
  async getCharacters(req: AuthRequest, res: Response) {
    try {
      const questline = await QuestlineModel.findById(req.params.id)
        .select('ownerId characterIds nodes')
        .lean();
      if (!questline) {
        res.status(404).json({ error: 'Questline not found' });
        return;
      }

      const characters = await CharacterModel.find({
        _id: { $in: questline.characterIds ?? [] },
      }).lean();

      // Node ids each character appears in — powers the panel's "Appears In".
      const nodeIdsByCharacter = new Map<string, string[]>();
      for (const n of questline.nodes ?? []) {
        for (const cid of [...(n.npcIds ?? []), ...(n.monsterIds ?? [])]) {
          const arr = nodeIdsByCharacter.get(cid) ?? [];
          arr.push(n.nodeId);
          nodeIdsByCharacter.set(cid, arr);
        }
      }

      const shaped = await Promise.all(
        characters.map(async (c) => ({
          _id:        c._id.toString(),
          name:       c.name,
          appearance: c.appearance ?? '',
          background: c.lore ?? '',
          imageUrl:   await signCharacterPreview(c),
          questIds:   nodeIdsByCharacter.get(c._id.toString()) ?? [],
          kbRef:      c.kbRef ?? '',
        })),
      );
      res.json(shaped);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // PUT /questlines/:id/characters/:characterId — update the referenced Character
  // doc, mapping the legacy embedded field names (background→lore, imageUrl→portraitUrl).
  async updateCharacter(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const questline = await QuestlineModel.findById(req.params.id).select('ownerId').lean();
      if (!questline) {
        res.status(404).json({ error: 'Questline not found' });
        return;
      }
      if (questline.ownerId !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const character = await CharacterModel.findById(req.params.characterId);
      if (!character || character.ownerId !== userId) {
        res.status(404).json({ error: 'Character not found' });
        return;
      }

      const body = req.body as { appearance?: string; background?: string; imageUrl?: string };
      if (body.appearance !== undefined) character.appearance = body.appearance;
      if (body.background !== undefined) character.lore = body.background;
      if (body.imageUrl !== undefined) character.portraitUrl = body.imageUrl;
      await character.save();

      res.json({
        _id:        character._id.toString(),
        name:       character.name,
        appearance: character.appearance,
        background: character.lore,
        imageUrl:   await signCharacterPreview(character),
        questIds:   [],
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // ── Rewards ───────────────────────────────────────────────────────────────

  // GET /questlines/:id/rewards
  async getRewards(req: AuthRequest, res: Response) {
    try {
      const questline = await QuestlineModel.findById(req.params.id).select('ownerId rewards').lean();
      if (!questline) { res.status(404).json({ error: 'Questline not found' }); return; }
      const rewards = await Promise.all(
        questline.rewards.map(async (r) => {
          if (isS3Key(r.imageUrl ?? '')) {
            return { ...r, imageUrl: await getPresignedUrl(r.imageUrl!) };
          }
          return r;
        }),
      );
      res.json(rewards);
    } catch (error) { this.handleError(res, error); }
  }

  // POST /questlines/:id/rewards
  async createReward(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const questline = await QuestlineModel.findById(req.params.id);
      if (!questline) { res.status(404).json({ error: 'Questline not found' }); return; }
      if (questline.ownerId !== userId) { res.status(403).json({ error: 'Forbidden' }); return; }
      questline.rewards.push(req.body);
      await questline.save();
      res.status(201).json(questline.rewards[questline.rewards.length - 1]);
    } catch (error) { this.handleError(res, error); }
  }

  // PUT /questlines/:id/rewards/:rewardId
  async updateReward(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const questline = await QuestlineModel.findById(req.params.id);
      if (!questline) { res.status(404).json({ error: 'Questline not found' }); return; }
      if (questline.ownerId !== userId) { res.status(403).json({ error: 'Forbidden' }); return; }
      const reward = questline.rewards.find((r) => r._id.toString() === req.params.rewardId);
      if (!reward) { res.status(404).json({ error: 'Reward not found' }); return; }
      Object.assign(reward, req.body);
      await questline.save();
      res.json(reward);
    } catch (error) { this.handleError(res, error); }
  }

  // GET /questlines/:id/rewards/:rewardId/usage — node references for this reward,
  // so the UI can warn before deletion strips them.
  async getRewardUsage(req: AuthRequest, res: Response) {
    try {
      const questline = await QuestlineModel.findById(req.params.id).select('ownerId nodes').lean();
      if (!questline) { res.status(404).json({ error: 'Questline not found' }); return; }
      const rewardId = String(req.params.rewardId);
      const nodeCount = (questline.nodes ?? []).filter(
        (n) => (n.rewardIds ?? []).includes(rewardId),
      ).length;
      res.json({ nodeCount });
    } catch (error) { this.handleError(res, error); }
  }

  // DELETE /questlines/:id/rewards/:rewardId — also strips the reward id from every
  // node's rewardIds so no dangling references are left behind.
  async deleteReward(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const questline = await QuestlineModel.findById(req.params.id);
      if (!questline) { res.status(404).json({ error: 'Questline not found' }); return; }
      if (questline.ownerId !== userId) { res.status(403).json({ error: 'Forbidden' }); return; }
      const before = questline.rewards.length;
      questline.rewards = questline.rewards.filter(
        (r) => r._id.toString() !== req.params.rewardId,
      ) as typeof questline.rewards;
      if (questline.rewards.length === before) { res.status(404).json({ error: 'Reward not found' }); return; }
      questline.nodes.forEach((n) => {
        n.rewardIds = n.rewardIds.filter((rid) => rid !== req.params.rewardId);
      });
      await questline.save();
      res.json({ message: 'Reward deleted' });
    } catch (error) { this.handleError(res, error); }
  }

  // ── Quest summaries ───────────────────────────────────────────────────────

  // GET /questlines/:id/quests
  async getQuestSummaries(req: AuthRequest, res: Response) {
    try {
      const questline = await QuestlineModel.findById(req.params.id).select('ownerId nodes');
      if (!questline) {
        res.status(404).json({ error: 'Questline not found' });
        return;
      }
      res.json(questline.nodes.map((n) => ({ id: n.nodeId, title: n.title, variant: n.variant })));
    } catch (error) {
      this.handleError(res, error);
    }
  }
}

export default new QuestlineController();
