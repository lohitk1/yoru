import Anthropic from "@anthropic-ai/sdk";
import { tools } from "./tools";
import { handleToolCall } from "./tool-handlers";

const client = new Anthropic();

interface UserContext {
  googleId: string;
  supabaseUserId: string;
  email: string;
}

type Message = Anthropic.MessageParam;

export async function runChatLoop(
  user: UserContext,
  conversationHistory: Message[],
  userMessage: string,
  systemPrompt: string
): Promise<{ response: string; updatedHistory: Message[] }> {
  const messages: Message[] = [
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  let response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    tools,
    messages,
  });

  while (response.stop_reason === "tool_use") {
    const assistantMessage: Message = { role: "assistant", content: response.content };
    messages.push(assistantMessage);

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use") {
        try {
          const result = await handleToolCall(block.name, block.input as Record<string, any>, user);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        } catch (err: any) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ error: err.message }),
            is_error: true,
          });
        }
      }
    }

    messages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });
  }

  const textResponse = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  messages.push({ role: "assistant", content: response.content });

  return {
    response: textResponse,
    updatedHistory: messages,
  };
}
