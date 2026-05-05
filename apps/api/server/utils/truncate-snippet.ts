// Slack message bodies returned by the search/history APIs contain JSON-style
// backslash escapes ("\"" for literal quotes inside the text) because the
// content originates from the user's keyboard and Slack stores it that way.
// When the model echoes those escapes into a card row, Slack renders them as
// literal `\"` characters. Strip them so the snippet reads cleanly.
const stripSlackTextEscapes = (text: string): string =>
  text.replace(/\\(["'])/g, "$1");

export const truncateSnippet = (text: string, maxChars: number): string => {
  const cleaned = stripSlackTextEscapes(text).replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars - 3)}...`;
};
