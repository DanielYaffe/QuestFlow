import { FormatModule, CanonicalExport } from '../types';

const questflowJson: FormatModule = {
  id:        'questflow-json',
  label:     'QuestFlow JSON',
  extension: '.json',
  mimeType:  'application/json',
  render: (payload: CanonicalExport): string =>
    JSON.stringify(payload, null, 2),
};

export default questflowJson;
