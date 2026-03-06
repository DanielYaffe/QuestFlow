import { Router } from 'express';
import { getQuestStyles } from '../controllers/questStyleController';

const questStyleRouter = Router();

questStyleRouter.get('/', getQuestStyles);

export default questStyleRouter;
