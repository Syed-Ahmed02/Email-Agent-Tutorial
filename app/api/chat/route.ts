import { streamText, UIMessage, convertToModelMessages } from 'ai';
import { openrouter } from '@/lib/openrouter';

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openrouter("openrouter/free"),
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}