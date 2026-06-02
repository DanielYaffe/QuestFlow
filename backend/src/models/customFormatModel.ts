import mongoose, { Document, Schema } from 'mongoose';

/**
 * A binding rule keyed by a JSON path within the pasted `example`.
 *  - absent / { type: 'const' }              → keep the example value as-is
 *  - { type: 'field', field: 'title' }       → substitute a quest field
 *  - { type: 'repeat', over: 'monsters' }     → on an array path: loop, using
 *                                               example[path][0] as the item template
 *  - { type: 'item' }                         → inside a repeat: the current element
 *  - { type: 'item-field', field: 'id' }      → inside a repeat: a field of the element
 */
export interface IBindingRule {
  type: 'const' | 'field' | 'repeat' | 'item' | 'item-field';
  field?: string;
  over?: string;
}

export interface ICustomFormat extends Document {
  ownerId: string;
  name: string;
  extension: string;
  fileNamePattern: string;
  example: unknown;                      // pasted JSON, untouched
  bindings: Record<string, IBindingRule>; // path → rule
}

const CustomFormatSchema = new Schema<ICustomFormat>(
  {
    ownerId:         { type: String, required: true, index: true },
    name:            { type: String, required: true },
    extension:       { type: String, default: 'json' },
    fileNamePattern: { type: String, default: '{{id}}' },
    example:         { type: Schema.Types.Mixed, default: {} },
    bindings:        { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

const CustomFormatModel = mongoose.model<ICustomFormat>('CustomFormat', CustomFormatSchema);
export default CustomFormatModel;
