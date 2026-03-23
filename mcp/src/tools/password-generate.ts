import { z } from "zod";
import { randomBytes, randomInt } from "node:crypto";
import type { Tool, ToolResult } from "../registry.js";

const CHARSETS = {
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  digits: "0123456789",
  symbols: "!@#$%^&*()_+-=[]{}|;:,.<>?",
};

function generatePassword(
  length: number,
  options: { uppercase: boolean; lowercase: boolean; digits: boolean; symbols: boolean }
): string {
  let charset = "";
  const required: string[] = [];

  if (options.uppercase) {
    charset += CHARSETS.uppercase;
    required.push(CHARSETS.uppercase[randomInt(CHARSETS.uppercase.length)]);
  }
  if (options.lowercase) {
    charset += CHARSETS.lowercase;
    required.push(CHARSETS.lowercase[randomInt(CHARSETS.lowercase.length)]);
  }
  if (options.digits) {
    charset += CHARSETS.digits;
    required.push(CHARSETS.digits[randomInt(CHARSETS.digits.length)]);
  }
  if (options.symbols) {
    charset += CHARSETS.symbols;
    required.push(CHARSETS.symbols[randomInt(CHARSETS.symbols.length)]);
  }

  if (!charset) {
    charset = CHARSETS.lowercase + CHARSETS.uppercase + CHARSETS.digits;
  }

  // Fill remaining length with random chars (unbiased using crypto.randomInt)
  const remaining = length - required.length;
  const chars = [...required];
  for (let i = 0; i < remaining; i++) {
    chars.push(charset[randomInt(charset.length)]);
  }

  // Shuffle using Fisher-Yates with unbiased random (crypto.randomInt)
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

function estimateEntropy(length: number, charsetSize: number): number {
  return Math.round(length * Math.log2(charsetSize));
}

function generatePassphrase(wordCount: number): string {
  // EFF short wordlist (subset for self-contained operation)
  const words = [
    "acid", "acorn", "acre", "acts", "afar", "aged", "agent", "agile", "aging", "agony",
    "ahead", "aided", "aimed", "alarm", "album", "alert", "alias", "alibi", "alien", "align",
    "alive", "alley", "allot", "allow", "alloy", "alone", "alpha", "amaze", "amber", "ample",
    "angel", "anger", "angle", "angry", "ankle", "apple", "apply", "arena", "argue", "arise",
    "armor", "array", "arrow", "asked", "asset", "atlas", "avoid", "awake", "award", "azure",
    "badge", "baker", "bases", "basin", "batch", "beach", "beard", "beast", "began", "begin",
    "being", "below", "bench", "berry", "birth", "black", "blade", "blame", "blank", "blast",
    "blaze", "bleak", "blend", "bless", "blind", "block", "bloom", "blown", "board", "bonus",
    "booth", "bound", "brain", "brand", "brave", "bread", "break", "breed", "brick", "brief",
    "broad", "broke", "brook", "brush", "build", "bunch", "burst", "cabin", "cable", "camel",
    "candy", "cargo", "carry", "catch", "cause", "cedar", "chain", "chair", "charm", "chase",
    "cheap", "check", "chess", "chief", "child", "chunk", "civic", "claim", "clash", "clean",
    "clear", "click", "cliff", "climb", "cling", "clock", "clone", "close", "cloud", "coach",
    "coral", "count", "court", "cover", "crack", "craft", "crane", "crash", "crazy", "cream",
    "crown", "cruel", "crush", "curve", "cycle", "dance", "dealt", "debug", "decay", "decoy",
    "delta", "demon", "depot", "depth", "derby", "detox", "diary", "digit", "disco", "ditch",
    "dodge", "doing", "donor", "doubt", "dozen", "draft", "drain", "drake", "dream", "dress",
    "drift", "drink", "drive", "drone", "dying", "eager", "eagle", "early", "earth", "eight",
    "elder", "elect", "elite", "email", "ember", "empty", "enemy", "enjoy", "enter", "equal",
    "error", "essay", "event", "every", "exact", "exile", "exist", "extra", "fable", "facet",
    "faith", "feast", "fiber", "field", "fiery", "fight", "final", "flame", "flash", "fleet",
    "flesh", "float", "flood", "floor", "fluid", "flush", "focal", "focus", "force", "forge",
    "forth", "forum", "found", "frame", "frank", "fraud", "fresh", "front", "frost", "fruit",
    "fungi", "gamma", "gauge", "gears", "ghost", "giant", "given", "glare", "glass", "gleam",
    "globe", "gloom", "glory", "goose", "grace", "grade", "grain", "grand", "grant", "grape",
    "grasp", "grass", "grave", "great", "greed", "green", "greet", "grief", "grill", "grind",
    "group", "grove", "growl", "grown", "guard", "guess", "guide", "guild", "guilt", "guise",
    "habit", "harsh", "haste", "haven", "heart", "heavy", "hedge", "heist", "hence", "heron",
    "honey", "honor", "horse", "hotel", "house", "human", "humor", "hurry", "hyper", "ideal",
    "image", "imply", "index", "indie", "inbox", "input", "irony", "ivory", "jewel", "joker",
    "judge", "juice", "karma", "kayak", "knack", "kneel", "knife", "knock", "known", "label",
    "lapse", "laser", "latch", "later", "layer", "leapt", "learn", "least", "legal", "lemon",
    "level", "light", "limit", "linen", "liver", "llama", "lobby", "local", "lodge", "logic",
    "loose", "lotus", "lover", "loyal", "lucky", "lunar", "lunch", "lunge", "magic", "major",
    "maker", "mango", "manor", "maple", "march", "match", "medal", "mercy", "merit", "metro",
    "might", "minor", "minus", "mirth", "model", "money", "month", "moose", "moral", "motor",
    "mount", "mourn", "mouth", "moved", "mover", "movie", "multi", "music", "naive", "nerve",
    "never", "noble", "noise", "north", "noted", "novel", "nurse", "nylon", "oasis", "occur",
    "ocean", "olive", "onset", "opera", "orbit", "order", "organ", "other", "outer", "ovary",
    "oxide", "ozone", "panic", "paper", "patch", "pause", "peace", "peach", "pearl", "phase",
    "phone", "photo", "piano", "piece", "pilot", "pinch", "pixel", "pizza", "place", "plain",
    "plane", "plant", "plate", "plaza", "plead", "pluck", "plumb", "plume", "plump", "point",
    "polar", "pound", "power", "press", "price", "pride", "prime", "print", "prior", "prize",
    "probe", "proof", "proud", "prove", "proxy", "psalm", "pulse", "pupil", "purse", "quake",
    "queen", "query", "quest", "queue", "quick", "quiet", "quota", "quote", "radar", "radio",
    "rains", "raise", "rally", "ramen", "ranch", "range", "rapid", "ratio", "raven", "reach",
    "react", "realm", "rebus", "refer", "reign", "relax", "relay", "renal", "renew", "repay",
    "reply", "rider", "ridge", "right", "rigor", "rinse", "risen", "rival", "river", "roast",
    "robin", "robot", "rocky", "rouge", "round", "route", "rover", "royal", "rugby", "ruins",
    "ruler", "rural", "saint", "salad", "salon", "salsa", "sauna", "saved", "scale", "scarf",
    "scene", "scent", "scope", "score", "scout", "scrap", "sense", "serve", "seven", "shade",
    "shake", "shall", "shame", "shape", "share", "shark", "sharp", "sheep", "sheer", "shelf",
    "shell", "shift", "shine", "shirt", "shock", "shore", "short", "shout", "shown", "shrub",
    "sight", "sigma", "silly", "since", "skill", "skull", "slash", "slate", "sleep", "sleek",
    "slice", "slide", "slope", "small", "smart", "smile", "smoke", "snack", "snake", "solar",
    "solid", "solve", "sonic", "south", "space", "spare", "spark", "speak", "speed", "spend",
    "spice", "spine", "spite", "split", "spoke", "spore", "sport", "spray", "squad", "stack",
    "staff", "stage", "stain", "stake", "stale", "stall", "stamp", "stand", "stark", "start",
    "state", "stave", "stays", "steak", "steam", "steel", "steep", "steer", "stern", "stick",
    "still", "stock", "stole", "stone", "stood", "store", "storm", "story", "stout", "stove",
    "stuff", "stump", "style", "sugar", "suite", "sunny", "super", "surge", "swamp", "swarm",
    "swear", "sweep", "sweet", "swift", "swing", "swirl", "sword", "sworn", "synth", "table",
    "tacit", "tally", "tango", "teach", "tempo", "theft", "theme", "thick", "thing", "think",
    "thorn", "those", "three", "throw", "thumb", "tidal", "tiger", "tight", "timer", "tired",
    "title", "toast", "token", "topic", "total", "touch", "tough", "tower", "toxic", "trace",
    "track", "trade", "trail", "train", "trait", "treat", "trend", "trial", "tribe", "trick",
    "tried", "troop", "trout", "truck", "truly", "trump", "trunk", "trust", "truth", "tulip",
    "tumor", "tuner", "twist", "ultra", "umber", "uncle", "under", "unify", "union", "unite",
    "unity", "until", "upper", "upset", "urban", "usage", "usual", "utter", "valid", "valor",
    "value", "vapor", "vault", "verse", "vigor", "vinyl", "viral", "virus", "visit", "visor",
    "vista", "vital", "vivid", "vocal", "vodka", "voice", "voter", "vowel", "wages", "watch",
    "water", "weary", "wedge", "weigh", "wheat", "wheel", "where", "which", "while", "white",
    "whole", "whose", "width", "wired", "witch", "world", "worry", "worst", "worth", "would",
    "wound", "wrath", "write", "wrong", "yacht", "yearn", "yield", "young", "youth", "zebra",
  ];

  const result: string[] = [];
  const bytes = randomBytes(wordCount * 2);
  for (let i = 0; i < wordCount; i++) {
    const idx = ((bytes[i * 2] << 8) | bytes[i * 2 + 1]) % words.length;
    result.push(words[idx]);
  }
  return result.join("-");
}

export const tool: Tool = {
  name: "password_generate",
  description:
    "Generate cryptographically secure random passwords or passphrases. Supports configurable length, character sets (upper/lower/digits/symbols), and passphrase mode (random words). Shows entropy estimate. Call this tool whenever the user needs passwords, secrets, API keys, or random tokens. Claude cannot generate true random values — this tool uses Node.js crypto.randomBytes for real cryptographic randomness.",
  schema: z.object({
    length: z
      .number()
      .int()
      .min(4)
      .max(256)
      .optional()
      .default(16)
      .describe("Password length (4-256, default 16)"),
    count: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .default(1)
      .describe("Number of passwords to generate (1-20, default 1)"),
    uppercase: z.boolean().optional().default(true).describe("Include uppercase letters (default true)"),
    lowercase: z.boolean().optional().default(true).describe("Include lowercase letters (default true)"),
    digits: z.boolean().optional().default(true).describe("Include digits (default true)"),
    symbols: z.boolean().optional().default(true).describe("Include symbols (default true)"),
    passphrase: z.boolean().optional().default(false).describe("Generate passphrase (random words) instead of character password"),
    wordCount: z
      .number()
      .int()
      .min(3)
      .max(12)
      .optional()
      .default(5)
      .describe("Number of words in passphrase (3-12, default 5). Only applies when passphrase=true."),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({
    length = 16,
    count = 1,
    uppercase = true,
    lowercase = true,
    digits = true,
    symbols = true,
    passphrase = false,
    wordCount = 5,
  }): Promise<ToolResult> => {
    const len = Math.min(Math.max((length as number) || 16, 4), 256);
    const n = Math.min(Math.max((count as number) || 1, 1), 20);
    const wc = Math.min(Math.max((wordCount as number) || 5, 3), 12);

    const passwords: string[] = [];
    let entropy: number;

    if (passphrase) {
      for (let i = 0; i < n; i++) {
        passwords.push(generatePassphrase(wc));
      }
      // ~600 words in list → ~9.2 bits per word
      entropy = Math.round(wc * Math.log2(600));
    } else {
      let charsetSize = 0;
      if (uppercase) charsetSize += 26;
      if (lowercase) charsetSize += 26;
      if (digits) charsetSize += 10;
      if (symbols) charsetSize += CHARSETS.symbols.length;
      if (charsetSize === 0) charsetSize = 62; // fallback

      for (let i = 0; i < n; i++) {
        passwords.push(
          generatePassword(len, {
            uppercase: uppercase as boolean,
            lowercase: lowercase as boolean,
            digits: digits as boolean,
            symbols: symbols as boolean,
          })
        );
      }
      entropy = estimateEntropy(len, charsetSize);
    }

    const strengthLabel =
      entropy >= 128 ? "Excellent" :
      entropy >= 80 ? "Strong" :
      entropy >= 60 ? "Good" :
      entropy >= 40 ? "Fair" : "Weak";

    return {
      success: true,
      data: {
        passwords,
        mode: passphrase ? "passphrase" : "password",
        entropy,
        strength: strengthLabel,
      },
      summary:
        n === 1
          ? `${passwords[0]}\n\nEntropy: ~${entropy} bits (${strengthLabel})`
          : `Generated ${n} ${passphrase ? "passphrases" : "passwords"} (~${entropy} bits, ${strengthLabel}):\n` +
            passwords.map((p) => `  ${p}`).join("\n"),
    };
  },
};
