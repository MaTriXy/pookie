import { after } from "next/server";

import {
  isSlackConfigured,
  slackNotConfiguredResponse,
} from "@/lib/deployment";
import { slackBot } from "@/server/bot";

type Platform = keyof typeof slackBot.webhooks;

export const maxDuration = 799;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  if (!isSlackConfigured()) return slackNotConfiguredResponse();

  const { platform } = await params;
  const handler = slackBot.webhooks[platform as Platform];
  if (!handler) {
    return new Response(`Unknown platform: ${platform}`, { status: 404 });
  }

  return handler(request, {
    waitUntil: (task) => after(() => task),
  });
}
