import ProjectModel, { IProjectAssetField, ProjectAssetFieldType } from '../models/projectModel';

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function valueMatchesType(value: unknown, type: ProjectAssetFieldType): boolean {
  if (isEmpty(value)) return true;
  if (type === 'text' || type === 'date' || type === 'image' || type === 'enum' || type === 'reference') {
    return typeof value === 'string';
  }
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
  if (type === 'list') return Array.isArray(value);
  return true;
}

function validateFields(
  fields: IProjectAssetField[],
  values: Record<string, unknown>,
  prefix = '',
): string[] {
  const errors: string[] = [];
  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.key}` : field.key;
    const value = values[field.key];
    if (field.required && isEmpty(value)) {
      errors.push(`${path} is required.`);
      continue;
    }
    if (!field.nullable && value === null) {
      errors.push(`${path} cannot be null.`);
      continue;
    }
    if (!valueMatchesType(value, field.type)) {
      errors.push(`${path} must be ${field.type}.`);
      continue;
    }
    if (field.type === 'object' && value && field.fields?.length) {
      errors.push(...validateFields(field.fields, value as Record<string, unknown>, path));
    }
  }
  return errors;
}

export async function validateAssetCustomFields(args: {
  ownerId: string;
  projectId: string;
  assetType: string;
  values: Record<string, unknown>;
}): Promise<string[]> {
  const project = await ProjectModel.findOne({ _id: args.projectId, ownerId: args.ownerId }).select('assetSchema').lean();
  if (!project) return ['Project not found.'];
  const schema = project.assetSchema?.assetTypes?.find((entry) => entry.key === args.assetType);
  if (!schema) return [];
  return validateFields(schema.fields ?? [], args.values);
}
