import { Request, Response } from 'express';
import BaseController from './baseController';
import QuestlineModel, { BASE_VARIANTS } from '../models/questlineModel';
import { AuthRequest } from '../middlewares/authMiddleware';
import { getPresignedUrl } from '../utils/s3Helper';

// S3 keys never start with http — presigned URLs always do
function isS3Key(value: string): boolean {
  return !!value && !value.startsWith('http');
}

class QuestlineController extends BaseController {
  constructor() {
    super(QuestlineModel);
  }

  // GET /questlines — only return metadata for questlines owned by the authenticated user
  async get(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const questlines = await QuestlineModel.find({ ownerId: userId })
        .select('title description ownerId createdAt updatedAt');
      res.json(questlines);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // POST /questlines — set ownerId from JWT
  async create(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    req.body.ownerId = userId;
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
      const questline = await QuestlineModel.findById(req.params.id).select('ownerId nodes edges characters rewards');
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

      // Build a remap for stale temp IDs (char-N / rew-N) to real MongoDB _ids.
      // This handles questlines generated before the ID-remapping fix was deployed.
      const staleCharMap  = new Map<string, string>(); // "char-1" → mongo _id (1-based index)
      const staleRewardMap = new Map<string, string>(); // "rew-1"  → mongo _id
      questline.characters.forEach((c, i) => staleCharMap.set(`char-${i + 1}`, c._id.toString()));
      questline.rewards.forEach((r, i) => staleRewardMap.set(`rew-${i + 1}`, r._id.toString()));

      const remapId = (id: string, charMap: Map<string, string>, rewMap: Map<string, string>): string =>
        charMap.get(id) ?? rewMap.get(id) ?? id;

      const shapedNodes = questline.nodes.map((n) => ({
        id: n.nodeId,
        type: n.type,
        data: {
          title:      n.title,
          body:       n.body,
          variant:    n.variant,
          npcIds:     (n.npcIds     ?? []).map((id) => remapId(id, staleCharMap, staleRewardMap)),
          monsterIds: (n.monsterIds ?? []).map((id) => remapId(id, staleCharMap, staleRewardMap)),
          rewardIds:  (n.rewardIds  ?? []).map((id) => remapId(id, staleCharMap, staleRewardMap)),
        },
      }));

      const shapedEdges = questline.edges.map((e) => ({
        id: e.edgeId,
        source: e.source,
        target: e.target,
      }));

      res.json({ nodes: shapedNodes, edges: shapedEdges, nextNodeId });
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
        nodes: { id: string; type?: string; data: { title: string; body: string; variant?: string; npcIds?: string[]; monsterIds?: string[]; rewardIds?: string[] } }[];
        edges: { id: string; source: string; target: string }[];
      };

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

  // GET /questlines/:id/characters
  async getCharacters(req: AuthRequest, res: Response) {
    try {
      const questline = await QuestlineModel.findById(req.params.id).select('ownerId characters').lean();
      if (!questline) {
        res.status(404).json({ error: 'Questline not found' });
        return;
      }
      const characters = await Promise.all(
        questline.characters.map(async (c) => {
          if (isS3Key(c.imageUrl ?? '')) {
            return { ...c, imageUrl: await getPresignedUrl(c.imageUrl!) };
          }
          return c;
        }),
      );
      res.json(characters);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // POST /questlines/:id/characters
  async createCharacter(req: AuthRequest, res: Response) {
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
      questline.characters.push(req.body);
      await questline.save();
      const created = questline.characters[questline.characters.length - 1];
      res.status(201).json(created);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // PUT /questlines/:id/characters/:characterId
  async updateCharacter(req: AuthRequest, res: Response) {
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
      const character = questline.characters.find(
        (c) => c._id.toString() === req.params.characterId,
      );
      if (!character) {
        res.status(404).json({ error: 'Character not found' });
        return;
      }
      Object.assign(character, req.body);
      await questline.save();
      res.json(character);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // DELETE /questlines/:id/characters/:characterId
  async deleteCharacter(req: AuthRequest, res: Response) {
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
      const before = questline.characters.length;
      questline.characters = questline.characters.filter(
        (c) => c._id.toString() !== req.params.characterId,
      ) as typeof questline.characters;
      if (questline.characters.length === before) {
        res.status(404).json({ error: 'Character not found' });
        return;
      }
      await questline.save();
      res.json({ message: 'Character deleted' });
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

  // DELETE /questlines/:id/rewards/:rewardId
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
      await questline.save();
      res.json({ message: 'Reward deleted' });
    } catch (error) { this.handleError(res, error); }
  }

  // ── Chapters ──────────────────────────────────────────────────────────────

  // GET /questlines/:id/chapters
  async getChapters(req: AuthRequest, res: Response) {
    try {
      const questline = await QuestlineModel.findById(req.params.id).select('ownerId chapters');
      if (!questline) {
        res.status(404).json({ error: 'Questline not found' });
        return;
      }
      res.json(questline.chapters);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // POST /questlines/:id/chapters
  async createChapter(req: AuthRequest, res: Response) {
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
      questline.chapters.push(req.body);
      await questline.save();
      const created = questline.chapters[questline.chapters.length - 1];
      res.status(201).json(created);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // PUT /questlines/:id/chapters/:chapterId
  async updateChapter(req: AuthRequest, res: Response) {
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
      const chapter = questline.chapters.find(
        (c) => c._id.toString() === req.params.chapterId,
      );
      if (!chapter) {
        res.status(404).json({ error: 'Chapter not found' });
        return;
      }
      Object.assign(chapter, req.body);
      await questline.save();
      res.json(chapter);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // DELETE /questlines/:id/chapters/:chapterId
  async deleteChapter(req: AuthRequest, res: Response) {
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
      const before = questline.chapters.length;
      questline.chapters = questline.chapters.filter(
        (c) => c._id.toString() !== req.params.chapterId,
      ) as typeof questline.chapters;
      if (questline.chapters.length === before) {
        res.status(404).json({ error: 'Chapter not found' });
        return;
      }
      await questline.save();
      res.json({ message: 'Chapter deleted' });
    } catch (error) {
      this.handleError(res, error);
    }
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
