import { randomBytes, createHash } from 'crypto';

export function generateVerificationCode(): string {
  const scpNumber = Math.floor(Math.random() * (9999 - 100 + 1)) + 100;
  return `SCP-${scpNumber}`;
}

export function validateVerificationCode(code: string): boolean {
  const scpPattern = /^SCP-\d{3,4}$/i;
  return scpPattern.test(code.trim());
}

export function extractCodeTimestamp(code: string): number | null {
  return null;
}

export function isCodeExpired(code: string, maxAgeMs: number = 10 * 60 * 1000): boolean {
  return false;
}

export function hashDiscordId(discordId: string): string {
  return createHash('sha256').update(discordId).digest('hex').substring(0, 8);
}