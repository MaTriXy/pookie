import { getPresetDisplayName } from "../../mcp/presets";

import type { Button, KnownBlock, SectionBlock } from "@slack/types";

import type { McpPreset } from "../../mcp/presets";

export interface OnboardingCardsInputs {
  presets: McpPreset[];
  connectedPresets: string[];
}

export interface OnboardingCards {
  text: string;
  blocks: KnownBlock[];
}

export const ONBOARDING_CONNECT_ACTION_ID = "onboarding-connect";

const intro = (): KnownBlock => ({
  type: "section",
  text: {
    type: "mrkdwn",
    text: [
      "hi. i'm a pookie -- a kitty that lives in your slack.",
      "",
      "@ me in any channel i'm in, or dm me directly. i remember what you tell me.",
      "",
      "i can find threads, generate images, run code, and search the web on my own. plug me into the tools below and i can use those too.",
      "",
      "tap a tool to connect, or skip -- i work without any. your data stays in your workspace.",
    ].join("\n"),
  },
});

const connectedSection = (preset: McpPreset): SectionBlock => ({
  type: "section",
  text: {
    type: "mrkdwn",
    text: `:white_check_mark: *${getPresetDisplayName(preset)}*\n_${preset.description}_`,
  },
});

const connectableSection = (preset: McpPreset): SectionBlock => {
  const accessory: Button = {
    type: "button",
    text: { type: "plain_text", text: "Connect", emoji: true },
    action_id: `${ONBOARDING_CONNECT_ACTION_ID}:${preset.name}`,
    value: preset.name,
    style: "primary",
  };

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${getPresetDisplayName(preset)}*\n_${preset.description}_`,
    },
    accessory,
  };
};

export const buildOnboardingCards = (
  inputs: OnboardingCardsInputs,
): OnboardingCards => {
  const connectedSet = new Set(inputs.connectedPresets);

  const blocks: KnownBlock[] = [intro()];

  for (const preset of inputs.presets) {
    blocks.push(
      connectedSet.has(preset.name)
        ? connectedSection(preset)
        : connectableSection(preset),
    );
  }

  const text = [
    "hi. i'm a pookie. connect any tools you want me to use, or skip.",
    "available tools: " +
      inputs.presets.map((preset) => getPresetDisplayName(preset)).join(", "),
  ].join("\n");

  return { text, blocks };
};
