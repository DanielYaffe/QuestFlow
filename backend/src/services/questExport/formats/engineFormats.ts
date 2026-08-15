import { EngineFormatModule } from '../types';
import unityAsset from './unityAsset';
import unrealDataTable from './unrealDataTable';
import godotTres from './godotTres';

export const engineFormats: Record<string, EngineFormatModule> = {
  'unity-asset':      unityAsset,
  'unreal-datatable': unrealDataTable,
  'godot-tres':       godotTres,
};
