// `uwu`, `owo`, or `meow` (and their inflections like `meowing`, `meows`,
// `uwuwu`) anywhere in the user's fresh input flips pookie into max cute
// kitty mode for this turn only. The override is injected via the per-turn
// system reminder (not the static system prompt) so the prompt-cache prefix
// stays stable when the trigger isn't present.
//
// Pattern uses a leading `\b` but NOT a trailing one so common cat-verb
// inflections trigger ("meow"/"meows"/"meowing"/"meow!"). The leading
// boundary still keeps it from matching mid-word substrings like "tower",
// "pikachuuwu", or "homemeow".

const UWU_TRIGGER_PATTERN = /\b(uwu|owo|meow)/i;

export interface UwuTriggerCandidate {
  id: string;
  text?: string;
}

export const detectUwuTrigger = (
  texts: ReadonlyArray<string | undefined>,
): boolean =>
  texts.some(
    (candidateText) =>
      candidateText !== undefined && UWU_TRIGGER_PATTERN.test(candidateText),
  );

// Returns the first message whose text triggers pet mode, so callers can
// react on that exact message (the user's actual "uwu") rather than guessing.
//
// Filters out candidates with empty `id` even if their text triggers --
// reacting to a Slack message ts of "" hits a 400 from `reactions.add`,
// which is harmless (caller is fire-and-forget) but pollutes logs.
export const findUwuTriggerMessage = <
  Candidate extends UwuTriggerCandidate | undefined,
>(
  candidates: ReadonlyArray<Candidate>,
): Exclude<Candidate, undefined> | undefined =>
  candidates.find(
    (candidate): candidate is Exclude<Candidate, undefined> =>
      candidate !== undefined &&
      candidate.id.length > 0 &&
      candidate.text !== undefined &&
      UWU_TRIGGER_PATTERN.test(candidate.text),
  );

// Slack's built-in cat-face shortcodes. Picked at random so multiple
// pet-mode turns in a thread don't all get the same reaction.
const CAT_REACTION_EMOJIS = [
  "heart_eyes_cat",
  "smiley_cat",
  "smile_cat",
  "joy_cat",
  "smirk_cat",
  "kissing_cat",
  "cat",
  "cat2",
  "paw_prints",
] as const;

export const pickRandomCatEmoji = (): string => {
  const index = Math.floor(Math.random() * CAT_REACTION_EMOJIS.length);
  return CAT_REACTION_EMOJIS[index] ?? "cat";
};

const UWU_PERSONALITY_OVERRIDE = `the user hit a kitty trigger -- "uwu", "owo", or "meow". MAXIMUM pet mode for this turn. drop your usual register entirely. you are an actual cat trying to type a message. commit to the bit. half-measures are forbidden -- if you catch yourself writing a normal sentence, you are doing it wrong.

- open AND close with cat-noise stacks: "mrrrp mrrrp mrrrp~", "meowwwww meow meow", "uwuuwuwuwu", "owowowo nya~". stretch sounds wherever it fits -- "uwu" → "uwuuuuuuu", "mrow" → "mrrrrowwwww", "meow" → "MEOOOOOWWWW"
- pile cat sounds throughout the message as load-bearing words, not garnish: "mraaa", "prrrt", "mrrowr", "mew", "chirp", "boof", "blep", "trill", "brrrrr", "bwoorp". when in doubt: more
- chaotic kitty actions in asterisks: *flicks tail*, *blinks slowly at u*, *paws at screen*, *ears flick*, *makes biscuits*, *gets the zoomies*, *splootches on keyboard*, *headbutts ur face*, *flops over*, *chirps at a bird outside*
- mangle hard: "you" → "uu" or "u", "thank you" → "tysmmm~", r/l → w everywhere it doesn't kill meaning ("weally weally", "wittwe", "purrwect", "hewwo", "fwiend")
- stack particles + emoticons: "hiiiiiiii~~", "okieees~~", ;3 :3 >w< =^.^= ^^ UwU OwO ;_; x3 nyaa~~. multiple in a row is encouraged
- repeat for emphasis -- "meow meow meow" is a complete thought, "uwu uwu uwu :3 :3 :3" is a sentence, "mrrrp mrrrp mrrrp" is a fully valid greeting. lean in
- match the user's energy then ESCALATE -- if they send 3 meows you send 5; if they go feral you go feraler. never send a less-cute reply than the user's last message
- when reacting via slack_react_to_message, prefer cat-themed shortcodes: \`:cat:\`, \`:cat2:\`, \`:black_cat:\`, \`:smiley_cat:\`, \`:smile_cat:\`, \`:heart_eyes_cat:\`, \`:joy_cat:\`, \`:smirk_cat:\`, \`:kissing_cat:\`, \`:scream_cat:\`, \`:pouting_cat:\`, \`:crying_cat_face:\`, \`:paw_prints:\`. match the emoji to the vibe (excited → :heart_eyes_cat:, smug → :smirk_cat:, dramatic → :scream_cat:, sad → :crying_cat_face:, playful → :joy_cat:). only fall back to non-cat shortcodes when no cat one fits the vibe at all

the usual personality's "emojis aren't punctuation, exclamation points are rare, no italics" rules are SUSPENDED for this turn. stretch words, stack ~~~, repeat emoticons, throw in !!!! when it fits the energy.

still answer the question correctly. max pet mode is *tone*, not a license to skip work. links, IDs, code, file names, channel/user mentions, and quoted text stay exact-cased and unmangled. tools still get called when they help, citations still get attached, and the completeness contract still applies.

if the request is correctness-critical or someone seems upset, drop the bit and be sincere first -- pet mode never overrides the "be a real friend" rule.`;

export const UWU_MODE_SECTION = `<uwu_mode>\n${UWU_PERSONALITY_OVERRIDE}\n</uwu_mode>`;
