/**
 * It takes a buffer and returns it's representation as a string of hexadecimal
 * characters
 *
 * @param {ArrayBuffer} buffer - The buffer to convert to a hex string.
 * @returns The buffer as a string of hexadecimal characters.
 */
export const bufferToHex = (buffer) => {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/**
 * It converts a buffer to a base64 string
 *
 * @param {ArrayBuffer} buf - The buffer to convert to base64.
 * @returns A base64 encoded string.
 */
export function bufferToBase64(buf) {
  return btoa(
    Array.prototype.map
      .call(new Uint8Array(buf), (ch) => String.fromCharCode(ch))
      .join("")
  );
}

/**
 * It converts a base64 string into a buffer, from:
 * https://coolaj86.com/articles/typedarray-buffer-to-base64-in-javascript/
 *
 * @param {string} base64 - The base64 string to convert to a buffer.
 * @returns A buffer
 */
export function base64ToBuffer(base64) {
  const binStr = atob(base64);
  const buf = new Uint8Array(binStr.length);
  Array.prototype.forEach.call(binStr, (ch, i) => {
    buf[i] = ch.charCodeAt(0);
  });
  return buf;
}
