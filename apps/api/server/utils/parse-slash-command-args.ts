export interface ParsedArgs {
  positional: string[];
  isChannel: boolean;
  isGlobal: boolean;
}

export interface ParsedSubcommandArgs extends ParsedArgs {
  subcommand: string;
}

export const tokenize = (text: string): string[] =>
  text.trim().split(/\s+/).filter(Boolean);

export const collectOptions = (tokens: string[]): ParsedArgs => {
  const positional: string[] = [];
  let isChannel = false;
  let isGlobal = false;

  for (const token of tokens) {
    if (token === "--channel") {
      isChannel = true;
    } else if (token === "--global") {
      isGlobal = true;
    } else {
      positional.push(token);
    }
  }

  return { positional, isChannel, isGlobal };
};

export const parseSubcommandArgs = (text: string): ParsedSubcommandArgs => {
  const tokens = tokenize(text);
  const subcommand = tokens[0]?.toLowerCase() ?? "";
  return { subcommand, ...collectOptions(tokens.slice(1)) };
};

export const parseOptions = (text: string): ParsedArgs =>
  collectOptions(tokenize(text));
