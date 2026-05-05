import { ChannelPanel } from "./channel-panel";
import { ComposerPanel } from "./composer-panel";
import { MockShell } from "./mock-shell";

export const PookieMockApp = () => (
  <MockShell activeChannel="pookie">
    <ChannelPanel />
    <ComposerPanel />
  </MockShell>
);
