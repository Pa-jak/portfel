// Client-side Web Crypto helpers for the secret vault (plausible deniability).
// The server NEVER sees the derived key or passphrase. Only ciphertext travels
// over the wire.

const PBKDF2_ITERATIONS = 200_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BITS = 256;

// ----- base64 <-> bytes -----
export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomBytes(len: number): Uint8Array {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return a;
}

export function randomSalt(): Uint8Array {
  return randomBytes(SALT_BYTES);
}

export function randomIv(): Uint8Array {
  return randomBytes(IV_BYTES);
}

// ----- key derivation -----
export async function deriveKey(
  passphrase: string,
  saltBytes: Uint8Array,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

// ----- encrypt / decrypt -----
export interface EncryptedBlob {
  ivBase64: string;
  ciphertextBase64: string;
}

export async function encryptJSON(
  obj: unknown,
  key: CryptoKey,
): Promise<EncryptedBlob> {
  const iv = randomIv();
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(obj));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    plaintext as BufferSource,
  );
  return {
    ivBase64: bytesToBase64(iv),
    ciphertextBase64: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptToJSON<T = unknown>(
  saltB64: string,
  ivB64: string,
  ciphertextB64: string,
  passphrase: string,
): Promise<T> {
  const salt = base64ToBytes(saltB64);
  const iv = base64ToBytes(ivB64);
  const ciphertext = base64ToBytes(ciphertextB64);
  const key = await deriveKey(passphrase, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ciphertext as BufferSource,
  );
  const dec = new TextDecoder();
  return JSON.parse(dec.decode(plaintext)) as T;
}

/** Re-encrypt payload with a freshly derived key (used for passphrase change). */
export async function encryptJSONWithPassphrase(
  obj: unknown,
  passphrase: string,
): Promise<{ salt: Uint8Array; iv: Uint8Array; ciphertext: Uint8Array } & { saltB64: string; ivB64: string; ciphertextB64: string }> {
  const salt = randomSalt();
  const key = await deriveKey(passphrase, salt);
  const enc = await encryptJSON(obj, key);
  return {
    salt,
    iv: base64ToBytes(enc.ivBase64),
    ciphertext: base64ToBytes(enc.ciphertextBase64),
    saltB64: bytesToBase64(salt),
    ivB64: enc.ivBase64,
    ciphertextB64: enc.ciphertextBase64,
  };
}