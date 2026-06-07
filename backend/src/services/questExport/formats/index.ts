import { FormatModule } from '../types';
import questflowJson from './questflowJson';
import questflowYaml from './questflowYaml';
import unityAsset from './unityAsset';
import unrealDataTable from './unrealDataTable';
import godotTres from './godotTres';

export const formats: Record<string, FormatModule> = {
  'questflow-json':   questflowJson,
  'questflow-yaml':   questflowYaml,
  'unity-asset':      unityAsset,
  'unreal-datatable': unrealDataTable,
  'godot-tres':       godotTres,
};
