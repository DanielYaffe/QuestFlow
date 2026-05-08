import { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime';
import { BedrockAgentClient } from '@aws-sdk/client-bedrock-agent';
import { config } from '../../config/config';

const credentials = {
  accessKeyId: config.AWS_ACCESS_KEY_ID,
  secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
};

export const bedrockRuntime = new BedrockAgentRuntimeClient({
  region: config.AWS_BEDROCK_REGION,
  credentials,
});

export const bedrockAgent = new BedrockAgentClient({
  region: config.AWS_BEDROCK_REGION,
  credentials,
});
