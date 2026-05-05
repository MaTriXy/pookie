import Cryptr from "cryptr";

const getCryptr = (): Cryptr | null => {
  const key = process.env.SLACK_ENCRYPTION_KEY;
  if (!key) return null;
  return new Cryptr(key);
};

export const encryptSecret = async (plaintext: string): Promise<string> => {
  const cryptr = getCryptr();
  if (!cryptr) throw new Error("SLACK_ENCRYPTION_KEY is not set");
  return cryptr.encrypt(plaintext);
};

export const decryptSecret = async (
  storedValue: unknown,
): Promise<string | null> => {
  const cryptr = getCryptr();
  if (!cryptr) throw new Error("SLACK_ENCRYPTION_KEY is not set");
  if (storedValue === null) return null;

  const stringValue =
    typeof storedValue === "string" ? storedValue : JSON.stringify(storedValue);

  try {
    return cryptr.decrypt(stringValue);
  } catch {
    return null;
  }
};

export const encryptJson = (value: unknown): unknown => {
  const cryptr = getCryptr();
  if (!cryptr) throw new Error("SLACK_ENCRYPTION_KEY is not set");
  return cryptr.encrypt(JSON.stringify(value));
};

// Gracefully handles both encrypted (string) and legacy unencrypted values
// so existing plaintext state in Redis keeps working after deployment.
export const decryptJson = <T>(stored: unknown): T => {
  if (typeof stored !== "string") return stored as T;
  const cryptr = getCryptr();
  if (!cryptr) throw new Error("SLACK_ENCRYPTION_KEY is not set");
  try {
    return JSON.parse(cryptr.decrypt(stored)) as T;
  } catch {
    return stored as unknown as T;
  }
};
