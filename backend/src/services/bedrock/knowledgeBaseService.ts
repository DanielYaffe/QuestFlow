import {
  StartIngestionJobCommand,
  DeleteKnowledgeBaseCommand,
} from '@aws-sdk/client-bedrock-agent';
import { bedrockAgent } from './bedrockClient';

// Full KB creation (vector store + S3 data source) is wired up in Phase 5 admin panel.
// The exact StorageConfiguration shape depends on the chosen vector store
// (OpenSearch Serverless, Pinecone, etc.) and is configured at deploy time.
export async function createKnowledgeBase(
  _name: string,
  _s3Path: string,
  _roleArn: string,
  _embeddingModelArn: string,
): Promise<string> {
  throw new Error('createKnowledgeBase: implement in Phase 5 with chosen vector store');
}

export async function syncKnowledgeBase(knowledgeBaseId: string, dataSourceId: string): Promise<void> {
  const command = new StartIngestionJobCommand({ knowledgeBaseId, dataSourceId });
  await bedrockAgent.send(command);
}

export async function deleteKnowledgeBase(knowledgeBaseId: string): Promise<void> {
  const command = new DeleteKnowledgeBaseCommand({ knowledgeBaseId });
  await bedrockAgent.send(command);
}
