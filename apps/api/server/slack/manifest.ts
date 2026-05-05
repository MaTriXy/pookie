import type * as SlackAPI from "@slack/web-api";

type SdkManifest = SlackAPI.AppsManifestCreateArguments["manifest"];

export type SlackApiManifest = SdkManifest;
type SdkOAuth = NonNullable<SdkManifest["oauth_config"]>;
type SdkSettings = NonNullable<SdkManifest["settings"]>;
type SdkEvents = NonNullable<SdkSettings["event_subscriptions"]>;

export interface PookieSlackSlashCommand {
  command: string;
  description: string;
  usage_hint?: string;
  should_escape?: boolean;
  url?: string;
}

export interface PookieSlackSuggestedPrompt {
  title: string;
  message: string;
}

export interface PookieSlackFeatures {
  app_home?: {
    home_tab_enabled: boolean;
    messages_tab_enabled: boolean;
    messages_tab_read_only_enabled: boolean;
  };
  assistant_view?: {
    assistant_description: string;
    suggested_prompts?: PookieSlackSuggestedPrompt[];
  };
  bot_user?: {
    display_name: string;
    always_online: boolean;
  };
  slash_commands?: PookieSlackSlashCommand[];
}

export interface SlackManifest extends Omit<
  SdkManifest,
  "oauth_config" | "settings" | "features"
> {
  oauth_config?: Omit<SdkOAuth, "scopes"> & {
    scopes?: { bot?: string[]; user?: string[]; user_optional?: string[] };
  };
  settings?: Omit<SdkSettings, "event_subscriptions"> & {
    event_subscriptions?: Omit<SdkEvents, "bot_events" | "user_events"> & {
      bot_events?: string[];
      user_events?: string[];
    };
    is_mcp_enabled?: boolean;
  };
  features?: PookieSlackFeatures;
}

const WEBHOOK_PATH = "/api/webhooks/slack";
const OAUTH_PATH = "/api/slack/oauth";

const DEFAULT_APP_NAME = "pookie";

export const BOT_SCOPES = [
  "canvases:read",
  "canvases:write",
  "app_mentions:read",
  "assistant:write",
  "channels:history",
  "channels:read",
  "chat:write",
  "commands",
  "files:read",
  "files:write",
  "groups:history",
  "groups:read",
  "im:history",
  "im:read",
  "im:write",
  "mpim:history",
  "mpim:read",
  "reactions:read",
  "reactions:write",
  "search:read.files",
  "search:read.public",
  "search:read.users",
  "users:read",
] as const;

export const USER_SCOPES = [
  "canvases:read",
  "canvases:write",
  "channels:history",
  "chat:write",
  "files:read",
  "groups:history",
  "im:history",
  "mpim:history",
  "search:read.files",
  "search:read.im",
  "search:read.mpim",
  "search:read.private",
  "search:read.public",
  "search:read.users",
  "users:read",
  "users:read.email",
] as const;

export const USER_OPTIONAL_SCOPES = [
  "groups:history",
  "mpim:history",
  "search:read.files",
  "search:read.im",
] as const;

const BOT_EVENTS = [
  "app_mention",
  "assistant_thread_started",
  "assistant_thread_context_changed",
  "member_joined_channel",
  "message.channels",
  "message.groups",
  "message.im",
  "message.mpim",
] as const;

export const createPookieManifest = (
  deployUrl?: URL,
  appName: string = DEFAULT_APP_NAME,
): SlackManifest => {
  const endpoint = (path: string): string | undefined => {
    if (!deployUrl) return undefined;
    const url = new URL(deployUrl);
    url.pathname = url.pathname.replace(/\/+$/, "") + path;
    url.search = "";
    url.hash = "";
    return url.toString();
  };
  const webhookUrl = endpoint(WEBHOOK_PATH);
  const oauthUrl = endpoint(OAUTH_PATH);

  return {
    display_information: {
      name: appName,
      description: "a kitty that lives in your slack",
      background_color: "#995a6f",
    },
    features: {
      app_home: {
        home_tab_enabled: false,
        messages_tab_enabled: true,
        messages_tab_read_only_enabled: false,
      },
      assistant_view: {
        assistant_description: "a kitty that lives in your slack",
        suggested_prompts: [
          {
            title: "Summarize this channel",
            message: "Can you summarize the recent activity in this channel?",
          },
          {
            title: "Search the workspace",
            message: "Search the workspace for recent discussions about ...",
          },
        ],
      },
      bot_user: {
        display_name: appName,
        always_online: true,
      },
      slash_commands: [
        {
          command: "/help",
          description: "See what pookie can do",
          should_escape: false,
          ...(webhookUrl ? { url: webhookUrl } : {}),
        },
        {
          command: "/mcp",
          description: "Manage MCP server connections",
          usage_hint: "add | list | presets | remove | status",
          should_escape: false,
          ...(webhookUrl ? { url: webhookUrl } : {}),
        },
        {
          command: "/mcp-add",
          description: "Add an MCP server",
          usage_hint: "<name> [url] [--channel | --global]",
          should_escape: false,
          ...(webhookUrl ? { url: webhookUrl } : {}),
        },
        {
          command: "/mcp-list",
          description: "List connected MCP servers",
          should_escape: false,
          ...(webhookUrl ? { url: webhookUrl } : {}),
        },
        {
          command: "/mcp-presets",
          description: "Show available MCP server presets",
          should_escape: false,
          ...(webhookUrl ? { url: webhookUrl } : {}),
        },
        {
          command: "/mcp-remove",
          description: "Remove an MCP server",
          usage_hint: "<name> [--channel | --global]",
          should_escape: false,
          ...(webhookUrl ? { url: webhookUrl } : {}),
        },
        {
          command: "/mcp-status",
          description: "Check MCP server connection status",
          should_escape: false,
          ...(webhookUrl ? { url: webhookUrl } : {}),
        },
        {
          command: "/onboarding",
          description: "Walk through connecting your tools to pookie",
          should_escape: false,
          ...(webhookUrl ? { url: webhookUrl } : {}),
        },
        {
          command: "/pookie-config",
          description: "View or tune pookie's personality and behavior",
          usage_hint: "set <key> <value> | unset <key> | reset",
          should_escape: false,
          ...(webhookUrl ? { url: webhookUrl } : {}),
        },
      ],
    },
    oauth_config: {
      ...(oauthUrl ? { redirect_urls: [oauthUrl] } : {}),
      scopes: {
        bot: [...BOT_SCOPES],
        user: [...USER_SCOPES],
        user_optional: [...USER_OPTIONAL_SCOPES],
      },
    },
    settings: {
      event_subscriptions: {
        ...(webhookUrl ? { request_url: webhookUrl } : {}),
        bot_events: [...BOT_EVENTS],
      },
      interactivity: {
        is_enabled: true,
        ...(webhookUrl ? { request_url: webhookUrl } : {}),
      },
      org_deploy_enabled: false,
      socket_mode_enabled: false,
      token_rotation_enabled: false,
      is_mcp_enabled: false,
    },
  };
};

export const toApiManifest = (manifest: SlackManifest): SlackApiManifest =>
  manifest as unknown as SlackApiManifest;

export const buildSlackAppCreateUrl = (manifest: SlackManifest): string => {
  const url = new URL("https://api.slack.com/apps");
  url.search = new URLSearchParams({
    new_app: "1",
    manifest_json: JSON.stringify(manifest),
  }).toString();
  return url.toString();
};
