import type { Attachment, Message } from "chat";

const describeAttachment = (attachment: Attachment): string =>
  attachment.name?.trim() || attachment.mimeType || attachment.type;

export const ensureAttachmentText = (messages: readonly Message[]): void => {
  for (const message of messages) {
    if (message.text.trim()) continue;
    if (!message.attachments?.length) continue;
    const summary = message.attachments.map(describeAttachment).join(", ");
    message.text = `(attached: ${summary})`;
  }
};
