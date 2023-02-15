import { assertEq } from "../test-helpers.js";

const alphaNum =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Return a random element from an array.
 * @template T
 * @param {T[]} a - The array to sample from.
 */
const sample = (a) => a[Math.floor(Math.random() * a.length)];

/**
 * Generates a random string of a specified length. Not suitable for cryptography
 * @param {number} n - The length of the string to be generated.
 */
export const randomString = (n) =>
  Array(n)
    .fill(null)
    .map(() => sample(alphaNum.split("")))
    .join("");

/**
 * Wait returns a promise that resolves after `ms` milliseconds.
 * @param {number} ms - The number of milliseconds to wait.
 */
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * If the object exists, return true if the object has the key, otherwise return false.
 * @param {Object} object - The object to check for the key.
 * @param {string} key - The key to check for.
 */
export const has = (object, key) =>
  object ? Object.prototype.hasOwnProperty.call(object, key) : false;

/**
 * It takes a buffer and returns it's representation as a string of hexadecimal characters
 * @param {ArrayBuffer} buffer - The buffer to convert to a hex string.
 * @returns The buffer as a string of hexadecimal characters.
 */
export const bufferToHex = (buffer) => {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/**
 * It converts an array of bytes to a string of binary
 * @param {ArrayBuffer} arr - The array to convert to binary.
 */
export const arrayToBinary = (arr) =>
  Array.prototype.map
    .call(new Uint8Array(arr), (ch) => String.fromCharCode(ch))
    .join("");

/**
 * It converts a string of binary data into an array of bytes
 * from: https://coolaj86.com/articles/typedarray-buffer-to-base64-in-javascript/
 * @param {string} binStr - The binary string to convert to an array.
 */
export function binaryToArray(binStr) {
  const buf = new Uint8Array(binStr.length);
  Array.prototype.forEach.call(binStr, (ch, i) => {
    buf[i] = ch.charCodeAt(0);
  });
  return buf;
};

/**
 * Url safe base64 encoding
 * It replaces the +, /, and = characters with -, _, and nothing, respectively
 * from: https://jsfiddle.net/magikMaker/7bjaT/
 *
 * @param {string} str - The string to be encoded.
 */
export function base64EncodeUrl(str) {
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/\=+$/, "");
};

/**
 * Does the reverse of `base64EncodeUrl`
 * @param {string} str - The string to decode.
 */
export function base64DecodeUrl(str) {
  if (str.length % 4 != 0) {
    str += "===".slice(0, 4 - (str.length % 4));
  }
  return str.replace(/-/g, "+").replace(/_/g, "/");
};

/**
 * Encodes a string into a url safe base64 string
 * @export
 * @param {string} s - The string to encode.
 * @returns the base64 encoded version of the string passed in.
 */
export function encodeUrlSafe(s) {
  return base64EncodeUrl(btoa(s));
}

/**
 * Does the reverse of `encodeUrlSafe`
 * @param {string} b - The base64 encoded string to decode
 * @returns the decoded version of the base64 encoded string.
 */
export function decodeUrlSafe(b) {
  return atob(base64DecodeUrl(b));
}

/**
 * It converts a buffer to a base64 string
 * @param {ArrayBuffer} buf - The buffer to convert to base64.
 * @returns A base64 encoded string.
 */
export function bufferToBase64(buf) {
  return btoa(arrayToBinary(buf));
}

/**
 * It converts a base64 string into a buffer
 * @param {string} base64 - The base64 string to convert to a buffer.
 * @returns A buffer
 */
export function base64ToBuffer(base64) {
  return binaryToArray(atob(base64));
}

/**
 * It generates a 128 bit key for the AES-GCM algorithm, which is a symmetric
 * encryption algorithm
 */
export async function generateKeyAES() {
  return crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 128,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Decrypts a javascript object encrypted by `encryptAES`
 *
 * @template T
 * @param {CryptoKey} aesKey - An AES-CGM key
 * @param {{iv: string, data: string}} encrypted - A base64 encoded IV paired
 * with base64 encoded encrypted data
 * @returns {Promise<T>} The decrypted object.
 */
export async function decryptAES(
  aesKey,
  { iv: ivBase64, data: encryptedBase64 }
) {
  const encryptedArray = base64ToBuffer(encryptedBase64);
  const iv = base64ToBuffer(ivBase64);
  const unencryptedArray = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    aesKey,
    encryptedArray
  );
  const decoder = new TextDecoder();
  const obj = JSON.parse(decoder.decode(unencryptedArray));
  return obj;
}

/**
 * Encrypts a javascript object
 *
 * @template T
 * @param {CryptoKey} aesKey - An AES-CGM key
 * @param {T} obj - The object to be encrypted. (must be `JSON.stringify`'able)
 * @returns base64 encoded, initialization vector and encrypted data
 */
export async function encryptAES(aesKey, obj) {
  const encoder = new TextEncoder();
  const unencryptedArray = encoder.encode(JSON.stringify(obj));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encryptedArray = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    aesKey,
    unencryptedArray
  );
  const encryptedBase64 = bufferToBase64(new Uint8Array(encryptedArray));
  const ivBase64 = bufferToBase64(iv);
  return { iv: ivBase64, data: encryptedBase64 };
};

/**
 * It takes an AES key and returns the raw bytes of the key
 * @param {CryptoKey} aesKey - The AES key to export.
 * @returns The raw key data.
 */
export async function exportKeyAES(aesKey) {
  return crypto.subtle.exportKey("raw", aesKey);
}

/**
 * It takes a raw AES key and returns a `CryptoKey`
 * @param {ArrayBuffer} rawAesKey - The AES key as a Uint8Array.
 * @returns CryptoKey
 */
export async function importKeyAES(rawAesKey) {
  return crypto.subtle.importKey("raw", rawAesKey, "AES-GCM", true, [
    "encrypt",
    "decrypt",
  ]);
}


export async function BasicEncryptionTest() {
  let testObj = { test: "foo"};
  let key = await generateKeyAES();
  let encryptedData = JSON.stringify(await encryptAES(key, testObj));
  let exportedKey = await exportKeyAES(key);
  let importedKey = await importKeyAES(exportedKey);
  let decryptedData = await decryptAES(importedKey, JSON.parse(encryptedData));
  assertEq(decryptedData.test, "foo");
}