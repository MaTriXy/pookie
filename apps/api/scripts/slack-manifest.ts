import { parseArgs } from "node:util";

import * as SlackAPI from "@slack/web-api";

import { createPookieManifest, toApiManifest } from "../server/slack/manifest";

import type { SlackManifest } from "../server/slack/manifest";

type Command = "validate" | "create" | "update" | "export" | "delete" | "print";

const COMMANDS = new Set<Command>([
  "validate",
  "create",
  "update",
  "export",
  "delete",
  "print",
]);

const USAGE = `
slack-manifest <command> [options]

Commands:
  print               Print the resolved manifest JSON to stdout
  validate            Validate the manifest against Slack's schema
  create              Create a new Slack app from the manifest
  update              Update an existing Slack app's manifest
  export              Print an existing Slack app's manifest from Slack
  delete              Permanently delete an existing Slack app

Options:
  --url <url>         Public URL of the Pookie deployment (e.g. https://pookie.example.com).
                      Falls back to env: POOKIE_URL.
  --app-id <id>       Slack app ID. Required for update / export / delete.
                      Falls back to env: SLACK_APP_ID.
  --token <token>     Slack app config access token. Falls back to env:
                      SLACK_APP_CONFIG_TOKEN. Create one at
                      https://api.slack.com/authentication/config-tokens.
  --name <name>       Bot display name. Defaults to "Pookie".

Examples:
  POOKIE_URL=https://pookie.example.com SLACK_APP_CONFIG_TOKEN=xoxe.xoxp-... \\
    pnpm slack-manifest validate

  pnpm slack-manifest create --url https://pookie.example.com --token xoxe...

  pnpm slack-manifest update --app-id A0123456 --url https://pookie.example.com
`;

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const requireToken = (token: string | undefined): string => {
  if (token) return token;
  return fail(
    "Missing config access token. Pass --token or set SLACK_APP_CONFIG_TOKEN.\n" +
      "Create one at https://api.slack.com/authentication/config-tokens.",
  );
};

const requireAppId = (appId: string | undefined): string => {
  if (appId) return appId;
  return fail("Missing app id. Pass --app-id or set SLACK_APP_ID.");
};

const buildManifest = ({
  url,
  appName,
}: {
  url: string | undefined;
  appName: string | undefined;
}): SlackManifest => {
  let deployUrl: URL | undefined;
  if (url) {
    try {
      deployUrl = new URL(url);
    } catch {
      fail(`Invalid --url / POOKIE_URL: ${url}`);
    }
  } else {
    console.warn(
      "[warn] No --url / POOKIE_URL provided. request_url fields will be omitted.\n" +
        "       This is fine for `print` but Slack will reject create/update without one.",
    );
  }
  return createPookieManifest(deployUrl, appName);
};

const main = async (): Promise<void> => {
  const [, , rawCommand, ...rest] = process.argv;

  if (!rawCommand || rawCommand === "--help" || rawCommand === "-h") {
    console.log(USAGE);
    return;
  }

  if (!COMMANDS.has(rawCommand as Command)) {
    fail(`Unknown command: ${rawCommand}\n${USAGE}`);
  }

  const command = rawCommand as Command;

  const { values } = parseArgs({
    args: rest,
    options: {
      url: { type: "string" },
      "app-id": { type: "string" },
      token: { type: "string" },
      name: { type: "string" },
    },
    allowPositionals: false,
  });

  const url = values.url ?? process.env.POOKIE_URL;
  const appId = values["app-id"] ?? process.env.SLACK_APP_ID;
  const token = values.token ?? process.env.SLACK_APP_CONFIG_TOKEN;
  const appName = values.name;

  if (command === "print") {
    const manifest = buildManifest({ url, appName });
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  const client = new SlackAPI.WebClient(requireToken(token));

  if (command === "validate") {
    const manifest = buildManifest({ url, appName });
    const result = await client.apps.manifest.validate({
      manifest: toApiManifest(manifest),
    });
    if (result.ok) console.log("[ok] manifest is valid");
    return;
  }

  if (command === "create") {
    const manifest = buildManifest({ url, appName });
    const result = await client.apps.manifest.create({
      manifest: toApiManifest(manifest),
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.ok && result.app_id) {
      console.error(
        `\nCreated app ${result.app_id}. Save this id as SLACK_APP_ID for future updates.`,
      );
    }
    return;
  }

  if (command === "update") {
    const manifest = buildManifest({ url, appName });
    const result = await client.apps.manifest.update({
      app_id: requireAppId(appId),
      manifest: toApiManifest(manifest),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "export") {
    const result = await client.apps.manifest.export({
      app_id: requireAppId(appId),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "delete") {
    const result = await client.apps.manifest.delete({
      app_id: requireAppId(appId),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
};

main().catch((error: unknown) => {
  console.error("[slack-manifest] failed:", error);
  process.exit(1);
});
