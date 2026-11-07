/**
 * Emoji assets. Emoji are colour glyphs, not line art, so they can't be cut
 * directly — here each one is rendered to a PNG with the system emoji font and
 * placed as a reference image, which you then trace into cut paths (same flow as
 * an upload). Rendering is on demand and offline; nothing is bundled or fetched.
 */

export interface EmojiItem {
  char: string;
  name: string;
  group: string;
}

export const EMOJI: EmojiItem[] = [
  // Smileys
  { char: "😀", name: "grinning face", group: "Smileys" },
  { char: "😃", name: "smiley", group: "Smileys" },
  { char: "😄", name: "laughing", group: "Smileys" },
  { char: "😁", name: "beaming", group: "Smileys" },
  { char: "😊", name: "smiling", group: "Smileys" },
  { char: "🙂", name: "slight smile", group: "Smileys" },
  { char: "😉", name: "wink", group: "Smileys" },
  { char: "😍", name: "heart eyes", group: "Smileys" },
  { char: "🥰", name: "smiling hearts", group: "Smileys" },
  { char: "😘", name: "blowing a kiss", group: "Smileys" },
  { char: "😎", name: "sunglasses", group: "Smileys" },
  { char: "🤩", name: "star struck", group: "Smileys" },
  { char: "😜", name: "winking tongue", group: "Smileys" },
  { char: "😂", name: "tears of joy", group: "Smileys" },
  { char: "🤣", name: "rolling laughing", group: "Smileys" },
  { char: "😭", name: "crying", group: "Smileys" },
  { char: "😮", name: "surprised", group: "Smileys" },
  { char: "😴", name: "sleeping", group: "Smileys" },
  { char: "🤔", name: "thinking", group: "Smileys" },
  { char: "😇", name: "angel", group: "Smileys" },
  { char: "🥳", name: "party face", group: "Smileys" },
  { char: "😤", name: "triumph", group: "Smileys" },
  { char: "🤯", name: "mind blown", group: "Smileys" },
  { char: "🥺", name: "pleading", group: "Smileys" },
  { char: "😈", name: "devil", group: "Smileys" },
  { char: "💀", name: "skull", group: "Smileys" },
  { char: "👻", name: "ghost", group: "Smileys" },
  { char: "🤖", name: "robot", group: "Smileys" },
  { char: "🎃", name: "jack-o-lantern", group: "Smileys" },
  { char: "😺", name: "grinning cat", group: "Smileys" },

  // Hearts & symbols
  { char: "❤️", name: "red heart", group: "Hearts" },
  { char: "🧡", name: "orange heart", group: "Hearts" },
  { char: "💛", name: "yellow heart", group: "Hearts" },
  { char: "💚", name: "green heart", group: "Hearts" },
  { char: "💙", name: "blue heart", group: "Hearts" },
  { char: "💜", name: "purple heart", group: "Hearts" },
  { char: "🖤", name: "black heart", group: "Hearts" },
  { char: "🤍", name: "white heart", group: "Hearts" },
  { char: "💕", name: "two hearts", group: "Hearts" },
  { char: "💖", name: "sparkling heart", group: "Hearts" },
  { char: "💗", name: "growing heart", group: "Hearts" },
  { char: "💘", name: "heart arrow", group: "Hearts" },
  { char: "💝", name: "heart gift", group: "Hearts" },
  { char: "💔", name: "broken heart", group: "Hearts" },
  { char: "⭐", name: "star", group: "Hearts" },
  { char: "🌟", name: "glowing star", group: "Hearts" },
  { char: "✨", name: "sparkles", group: "Hearts" },
  { char: "💫", name: "dizzy", group: "Hearts" },
  { char: "🔥", name: "fire", group: "Hearts" },
  { char: "💯", name: "hundred", group: "Hearts" },
  { char: "✅", name: "check mark", group: "Hearts" },
  { char: "❌", name: "cross mark", group: "Hearts" },
  { char: "❗", name: "exclamation", group: "Hearts" },
  { char: "❓", name: "question", group: "Hearts" },
  { char: "➕", name: "plus", group: "Hearts" },
  { char: "➗", name: "divide", group: "Hearts" },
  { char: "♻️", name: "recycle", group: "Hearts" },
  { char: "⚡", name: "lightning", group: "Hearts" },
  { char: "☮️", name: "peace", group: "Hearts" },
  { char: "☯️", name: "yin yang", group: "Hearts" },

  // Hands & people
  { char: "👍", name: "thumbs up", group: "Hands" },
  { char: "👎", name: "thumbs down", group: "Hands" },
  { char: "👌", name: "ok hand", group: "Hands" },
  { char: "✌️", name: "victory", group: "Hands" },
  { char: "🤞", name: "crossed fingers", group: "Hands" },
  { char: "🤟", name: "love you", group: "Hands" },
  { char: "🤙", name: "call me", group: "Hands" },
  { char: "👋", name: "wave", group: "Hands" },
  { char: "🙏", name: "pray", group: "Hands" },
  { char: "👏", name: "clap", group: "Hands" },
  { char: "💪", name: "muscle", group: "Hands" },
  { char: "🙌", name: "raising hands", group: "Hands" },
  { char: "👑", name: "crown", group: "Hands" },
  { char: "👀", name: "eyes", group: "Hands" },

  // Animals
  { char: "🐶", name: "dog", group: "Animals" },
  { char: "🐱", name: "cat", group: "Animals" },
  { char: "🐭", name: "mouse", group: "Animals" },
  { char: "🐰", name: "rabbit", group: "Animals" },
  { char: "🦊", name: "fox", group: "Animals" },
  { char: "🐻", name: "bear", group: "Animals" },
  { char: "🐼", name: "panda", group: "Animals" },
  { char: "🐨", name: "koala", group: "Animals" },
  { char: "🦁", name: "lion", group: "Animals" },
  { char: "🐯", name: "tiger", group: "Animals" },
  { char: "🐷", name: "pig", group: "Animals" },
  { char: "🐸", name: "frog", group: "Animals" },
  { char: "🐵", name: "monkey", group: "Animals" },
  { char: "🦄", name: "unicorn", group: "Animals" },
  { char: "🐝", name: "bee", group: "Animals" },
  { char: "🦋", name: "butterfly", group: "Animals" },
  { char: "🐢", name: "turtle", group: "Animals" },
  { char: "🐙", name: "octopus", group: "Animals" },
  { char: "🐠", name: "fish", group: "Animals" },
  { char: "🦖", name: "t-rex", group: "Animals" },

  // Food
  { char: "🍎", name: "apple", group: "Food" },
  { char: "🍌", name: "banana", group: "Food" },
  { char: "🍓", name: "strawberry", group: "Food" },
  { char: "🍉", name: "watermelon", group: "Food" },
  { char: "🍒", name: "cherries", group: "Food" },
  { char: "🍑", name: "peach", group: "Food" },
  { char: "🍕", name: "pizza", group: "Food" },
  { char: "🍔", name: "burger", group: "Food" },
  { char: "🌮", name: "taco", group: "Food" },
  { char: "🍟", name: "fries", group: "Food" },
  { char: "🍦", name: "ice cream", group: "Food" },
  { char: "🍩", name: "donut", group: "Food" },
  { char: "🍪", name: "cookie", group: "Food" },
  { char: "🎂", name: "cake", group: "Food" },
  { char: "🧁", name: "cupcake", group: "Food" },
  { char: "☕", name: "coffee", group: "Food" },

  // Nature & sky
  { char: "🌸", name: "cherry blossom", group: "Nature" },
  { char: "🌼", name: "blossom", group: "Nature" },
  { char: "🌻", name: "sunflower", group: "Nature" },
  { char: "🌹", name: "rose", group: "Nature" },
  { char: "🌷", name: "tulip", group: "Nature" },
  { char: "🌵", name: "cactus", group: "Nature" },
  { char: "🌴", name: "palm tree", group: "Nature" },
  { char: "🍀", name: "clover", group: "Nature" },
  { char: "🍁", name: "maple leaf", group: "Nature" },
  { char: "🌙", name: "moon", group: "Nature" },
  { char: "☀️", name: "sun", group: "Nature" },
  { char: "⛅", name: "cloud sun", group: "Nature" },
  { char: "🌈", name: "rainbow", group: "Nature" },
  { char: "❄️", name: "snowflake", group: "Nature" },
  { char: "💧", name: "droplet", group: "Nature" },
  { char: "🌊", name: "wave", group: "Nature" },

  // Travel & objects
  { char: "🚗", name: "car", group: "Objects" },
  { char: "✈️", name: "airplane", group: "Objects" },
  { char: "🚀", name: "rocket", group: "Objects" },
  { char: "⚓", name: "anchor", group: "Objects" },
  { char: "🎈", name: "balloon", group: "Objects" },
  { char: "🎁", name: "gift", group: "Objects" },
  { char: "🎉", name: "party popper", group: "Objects" },
  { char: "🎀", name: "ribbon", group: "Objects" },
  { char: "🎧", name: "headphones", group: "Objects" },
  { char: "🎵", name: "music note", group: "Objects" },
  { char: "📷", name: "camera", group: "Objects" },
  { char: "💡", name: "light bulb", group: "Objects" },
  { char: "🔑", name: "key", group: "Objects" },
  { char: "💎", name: "gem", group: "Objects" },
  { char: "🏆", name: "trophy", group: "Objects" },
  { char: "⚽", name: "soccer ball", group: "Objects" },
];

export const EMOJI_GROUPS: string[] = Array.from(new Set(EMOJI.map((e) => e.group)));

/** Render an emoji to a PNG data URL using the system emoji font. Client only. */
export function emojiToDataUrl(char: string, size = 256): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.floor(size * 0.78)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif`;
  ctx.fillText(char, size / 2, size / 2 + size * 0.04);
  return canvas.toDataURL("image/png");
}
