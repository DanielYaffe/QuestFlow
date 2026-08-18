import { Router } from 'express';
import { allocateId, buildPackage, checkIdAvailability, pushPackageToGithub } from '../controllers/mapleAssetController';

const mapleAssetRouter = Router();

mapleAssetRouter.get('/id-availability', checkIdAvailability);
mapleAssetRouter.post('/id-availability', checkIdAvailability);
mapleAssetRouter.get('/id-allocation', allocateId);
mapleAssetRouter.post('/id-allocation', allocateId);
mapleAssetRouter.post('/projects/:projectId/package', buildPackage);
mapleAssetRouter.post('/projects/:projectId/push-to-github', pushPackageToGithub);

export default mapleAssetRouter;
