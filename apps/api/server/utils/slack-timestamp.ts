/**
 * Convert a Slack timestamp ("1234567890.123456") into an ISO string. Slack
 * timestamps are unix seconds with microsecond precision; non-numeric inputs
 * (e.g. already-ISO strings) are returned unchanged.
 */
export const getISOFromSlackTimestamp = (timestamp: string): string => {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds)
    ? new Date(seconds * 1000).toISOString()
    : timestamp;
};
