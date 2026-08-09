import { FormatModule } from '../types';
import questflowJson from './questflowJson';
import questflowYaml from './questflowYaml';

export const formats: Record<string, FormatModule> = {
  'questflow-json':   questflowJson,
  'questflow-yaml':   questflowYaml,
};
