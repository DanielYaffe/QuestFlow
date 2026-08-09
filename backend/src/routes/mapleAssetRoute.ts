import { Router } from 'express';
import { buildPackage, checkIdAvailability, pushPackageToGithub } from '../controllers/mapleAssetController';

const mapleAssetRouter = Router();

mapleAssetRouter.get('/id-availability', checkIdAvailability);
mapleAssetRouter.post('/id-availability', checkIdAvailability);
mapleAssetRouter.post('/projects/:projectId/package', buildPackage);
mapleAssetRouter.post('/projects/:projectId/push-to-github', pushPackageToGithub);

export default mapleAssetRouter;
