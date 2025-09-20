import { randomBytes, createHash } from 'crypto';

const adjectives = [
  'happy', 'bright', 'calm', 'bold', 'sweet', 'fresh', 'warm', 'cool', 'soft', 'smooth',
  'quick', 'gentle', 'strong', 'light', 'dark', 'clear', 'pure', 'wild', 'free', 'brave',
  'kind', 'wise', 'fast', 'slow', 'tall', 'short', 'big', 'small', 'old', 'new',
  'pink', 'blue', 'green', 'red', 'gold', 'silver', 'white', 'black', 'orange', 'purple'
];

const nouns = [
  'apple', 'banana', 'cherry', 'grape', 'lemon', 'orange', 'peach', 'berry', 'mango', 'kiwi',
  'cookie', 'cake', 'bread', 'soup', 'pizza', 'pasta', 'rice', 'tea', 'coffee', 'milk',
  'book', 'pen', 'desk', 'chair', 'lamp', 'clock', 'phone', 'key', 'box', 'bag',
  'cat', 'dog', 'bird', 'fish', 'bear', 'fox', 'owl', 'bee', 'ant', 'duck',
  'tree', 'flower', 'grass', 'leaf', 'rock', 'sand', 'star', 'moon', 'sun', 'cloud',
  'ocean', 'river', 'lake', 'hill', 'path', 'bridge', 'house', 'garden', 'park', 'beach'
];

export function generateVerificationCode(): string {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun1 = nouns[Math.floor(Math.random() * nouns.length)];
  const noun2 = nouns[Math.floor(Math.random() * nouns.length)];
  
  // Ensure we don't get duplicate nouns
  let finalNoun2 = noun2;
  while (finalNoun2 === noun1) {
    finalNoun2 = nouns[Math.floor(Math.random() * nouns.length)];
  }
  
  return `${adjective} ${noun1} ${finalNoun2}`;
}

export function validateVerificationCode(code: string): boolean {
  // Updated pattern to match "adjective noun noun" format
  const words = code.toLowerCase().trim().split(' ');
  if (words.length !== 3) return false;
  
  // Check if all words are valid (contain only letters)
  return words.every(word => /^[a-z]+$/.test(word)) &&
         adjectives.includes(words[0]) &&
         nouns.includes(words[1]) &&
         nouns.includes(words[2]);
}

export function extractCodeTimestamp(code: string): number | null {
  // Word-based codes don't contain timestamps
  // Timestamp tracking is now handled by the verification storage system
  return null;
}

export function isCodeExpired(code: string, maxAgeMs: number = 10 * 60 * 1000): boolean {
  // Word-based codes don't contain timestamps
  // Expiration is now handled by the verification storage system
  return false;
}

export function hashDiscordId(discordId: string): string {
  return createHash('sha256').update(discordId).digest('hex').substring(0, 8);
}