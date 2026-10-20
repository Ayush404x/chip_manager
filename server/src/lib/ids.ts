import { randomBytes, randomInt } from 'node:crypto';

/** Unambiguous room-code alphabet (no 0/O/1/I). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(length = 6): string {
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return code;
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export function nicknameKey(nickname: string): string {
  return nickname.trim().toLocaleLowerCase('en-US');
}
