import { Router } from 'express';
import { buildPackage, downloadPackage, listStatuses, pushPackageToGithub } from '../controllers/assetPackageController';

const assetPackageRouter = Router();

assetPackageRouter.get('/projects/:projectId/status', listStatuses);
assetPackageRouter.post('/projects/:projectId/package', buildPackage);
assetPackageRouter.post('/projects/:projectId/package/download', downloadPackage);
assetPackageRouter.post('/projects/:projectId/package/push-to-github', pushPackageToGithub);

export default assetPackageRouter;
