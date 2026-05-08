import { InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { randomUUID } from 'crypto';
import { bedrockRuntime } from './bedrockClient';

export async function invokeAgent(
  agentId: string,
  agentAliasId: string,
  prompt: string,
): Promise<string> {
  const command = new InvokeAgentCommand({
    agentId,
    agentAliasId,
    sessionId: randomUUID(),
    inputText: prompt,
  });

  const response = await bedrockRuntime.send(command);

  let fullResponse = '';
  if (response.completion) {
    for await (const chunk of response.completion) {
      if (chunk.chunk?.bytes) {
        fullResponse += new TextDecoder().decode(chunk.chunk.bytes);
      }
    }
  }

  return fullResponse;
}
