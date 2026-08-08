import mongoose, { Document, Schema } from 'mongoose';

export interface IStyleLora {
  loraFilename: string;
  strength: number;
  strengthClip: number;
  triggerWord?: string;
}

export interface IWorkflowPatchMap {
  checkpointNode: string;
  positivePromptNode: string;
  negativePromptNode: string;
  dimensionsNode: string;
  seedNodes: string[];
  loraNode?: string;
  samplerParamsNode?: string;
}

export interface ISpriteStyle extends Document {
  styleId: string;
  name: string;
  description: string;
  previewImagePath: string;
  category: 'pixel' | 'illustrated' | 'realistic' | 'raw';
  baseModel: 'SDXL' | 'SD1.5' | 'Flux';
  // Which RunPod endpoint runs this style. Each endpoint is a separate Docker
  // image with exactly one checkpoint baked in, so checkpointFilename below is
  // not a free choice — it must match what the manifest says is in this image.
  // Plain String, not an enum: adding an endpoint should be a manifest change,
  // not a schema migration.
  endpointKey: string;
  checkpointFilename: string;
  loras: IStyleLora[];
  promptPrefix: string;
  negativePrompt: string;
  defaultDimensions: { width: number; height: number };
  // Post-processing: cut the background out on CPU after generation (worker-side)
  removeBackground: boolean;
  // Post-processing: pixel-snap + downscale the output to this size (worker-side)
  targetSize?: number;
  // sampler/scheduler names are whatever the ComfyUI build in the image
  // supports; there is no API to enumerate them, so the admin UI offers a
  // curated list and the API just requires non-empty names
  sampler: {
    steps: number;
    cfg: number;
    sampler: string;
    scheduler: string;
  };
  workflowTemplate: Record<string, unknown>;
  workflowPatchMap: IWorkflowPatchMap;
  // Which workflow preset the template was created from (absent on seeded or
  // raw-JSON styles) — display/provenance only, the template is the truth
  presetId?: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const StyleLoraSchema = new Schema<IStyleLora>(
  {
    loraFilename: { type: String, required: true },
    strength:     { type: Number, required: true },
    strengthClip: { type: Number, required: true },
    triggerWord:  { type: String },
  },
  { _id: false },
);

const WorkflowPatchMapSchema = new Schema<IWorkflowPatchMap>(
  {
    checkpointNode:          { type: String, required: true },
    positivePromptNode:      { type: String, required: true },
    negativePromptNode:      { type: String, required: true },
    dimensionsNode:          { type: String, required: true },
    seedNodes:               { type: [String], required: true },
    loraNode:                { type: String },
    samplerParamsNode:       { type: String },
  },
  { _id: false },
);

const SpriteStyleSchema = new Schema<ISpriteStyle>(
  {
    styleId:            { type: String, required: true, unique: true },
    name:               { type: String, required: true },
    description:        { type: String, default: '' },
    previewImagePath:   { type: String, default: '' },
    category:           { type: String, enum: ['pixel', 'illustrated', 'realistic', 'raw'], required: true },
    baseModel:          { type: String, enum: ['SDXL', 'SD1.5', 'Flux'], default: 'SDXL' },
    endpointKey:        { type: String, required: true },
    checkpointFilename: { type: String, required: true },
    loras:              { type: [StyleLoraSchema], default: [] },
    promptPrefix:       { type: String, default: '' },
    negativePrompt:     { type: String, default: '' },
    defaultDimensions:  {
      width:  { type: Number, default: 1024 },
      height: { type: Number, default: 1024 },
    },
    removeBackground: { type: Boolean, default: false },
    targetSize:  { type: Number },
    sampler: {
      steps:     { type: Number, default: 20 },
      cfg:       { type: Number, default: 7 },
      sampler:   { type: String, default: 'dpmpp_2m' },
      scheduler: { type: String, default: 'karras' },
    },
    workflowTemplate: { type: Schema.Types.Mixed, required: true },
    workflowPatchMap: { type: WorkflowPatchMapSchema, required: true },
    presetId:         { type: String },
    isDefault:  { type: Boolean, default: false },
    isActive:   { type: Boolean, default: true },
    sortOrder:  { type: Number, default: 0 },
  },
  { timestamps: true },
);

const SpriteStyleModel = mongoose.model<ISpriteStyle>('SpriteStyle', SpriteStyleSchema);
export default SpriteStyleModel;
