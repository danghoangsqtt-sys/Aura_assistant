
// Simple obfuscation to prevent plain-text reading in LocalStorage.
// Note: This is client-side only security.

const PREFIX = "NANA_SEC_";

export const encryptKey = (key: string): string => {
  if (!key) return "";
  try {
    // 1. Reverse string
    const reversed = key.split('').reverse().join('');
    // 2. Base64 encode
    const b64 = btoa(encodeURIComponent(reversed));
    // 3. Add Custom Prefix
    return PREFIX + b64;
  } catch (e) {
    console.error("Encryption failed", e);
    return key;
  }
};

export const decryptKey = (cipher: string): string => {
  if (!cipher) return "";
  // Return raw if it doesn't match our signature (backward compatibility)
  if (!cipher.startsWith(PREFIX)) return cipher;
  
  try {
    const b64 = cipher.replace(PREFIX, '');
    const reversed = decodeURIComponent(atob(b64));
    return reversed.split('').reverse().join('');
  } catch (e) {
    console.error("Decryption failed", e);
    return "";
  }
};
