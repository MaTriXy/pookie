import { resolveBaseUrl } from "@/lib/deployment";
import {
  buildSlackAppCreateUrl,
  createPookieManifest,
} from "@/server/slack/manifest";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const;

export const GET = (request: Request) => {
  const manifest = createPookieManifest(new URL(resolveBaseUrl(request)));
  const url = buildSlackAppCreateUrl(manifest);

  return Response.json(
    { url },
    {
      headers: CORS_HEADERS,
    },
  );
};

export const OPTIONS = () =>
  new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
