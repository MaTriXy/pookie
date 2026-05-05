import IORedis from "ioredis";

import { env } from "@/env";

export const redis = new IORedis(env.REDIS_URL, {
  ...(env.REDIS_URL.startsWith("rediss://") ? { tls: {} } : {}),
  // Don't open the TCP connection until the first command — the module is
  // imported during `next build` and from tests that mock redis, neither of
  // which want a real connection attempt at import time.
  lazyConnect: true,
});
