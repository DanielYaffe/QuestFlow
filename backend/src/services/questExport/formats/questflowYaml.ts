import yaml from 'js-yaml';
import { FormatModule, CanonicalExport } from '../types';

const questflowYaml: FormatModule = {
  id:        'questflow-yaml',
  label:     'QuestFlow YAML',
  extension: '.yaml',
  mimeType:  'application/x-yaml',
  render: (payload: CanonicalExport): string =>
    yaml.dump(payload, { noRefs: true, lineWidth: 120, quotingType: '"' }),
};

export default questflowYaml;
