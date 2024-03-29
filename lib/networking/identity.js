
export class Identity {
  /** @param {CryptoKeyPair} keyPair */
  constructor(keyPair) {
    this.keyPair = keyPair;
  }

  static async generate() {
    // Generate a public/private key pair
    const keys = await window.crypto.subtle.generateKey(
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      true,
      ["sign", "verify"]
    );
    return new Identity(keys);
  }

  /** @param {string} challenge */
  async signChallenge(challenge) {
    // Sign a challenge with the private key
    let signature = bufferToBase64(
      await window.crypto.subtle.sign(
        {
          name: "ECDSA",
          hash: { name: "SHA-256" },
        },
        this.keyPair.privateKey,
        base64ToBuffer(challenge)
      )
    );
    return { signature };
  }

  async publicId() {
    const rawKey = await crypto.subtle.exportKey("raw", this.keyPair.publicKey);
    return new PublicIdentity(bufferToBase64(rawKey));
  }

  async export() {
    const jwkPrivateKey = await crypto.subtle.exportKey(
      "jwk",
      this.keyPair.privateKey
    );
    const jwkPublicKey = await crypto.subtle.exportKey(
      "jwk",
      this.keyPair.publicKey
    );
    return { jwkPrivateKey, jwkPublicKey };
  }

  /** @param {{ jwkPrivateKey: JsonWebKey; jwkPublicKey: JsonWebKey }} s */
  static async import({ jwkPrivateKey, jwkPublicKey }) {
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      jwkPrivateKey,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign"]
    );
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      jwkPublicKey,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["verify"]
    );
    return new Identity({ privateKey, publicKey });
  }
}

export class PublicIdentity {
  /** @param {string} base64PublicKey */
  constructor(base64PublicKey) {
    this.rawKey = base64ToBuffer(base64PublicKey);
  }

  challenge() {
    const array = new Uint8Array(32);
    self.crypto.getRandomValues(array);
    const challenge = bufferToBase64(array);
    const verify = async (/** @type {string} */ signature) =>
      await this.verify(challenge, signature);
    return { challenge, verify };
  }

  toJSON() {
    return { publicKey: bufferToBase64(this.rawKey) };
  }

  /** @param {{ publicKey: string }} s */
  static fromJSON({ publicKey }) {
    return new PublicIdentity(publicKey);
  }

  async toName() {
    return bufferToHex(this.rawKey).slice(0, 16);
  }

  /**
   * Verify a signed challenge with the public key
   *
   * @param {string} challenge
   * @param {string} signature
   */
  async verify(challenge, signature) {
    const key = await crypto.subtle.importKey(
      "raw",
      this.rawKey,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["verify"]
    );
    return await window.crypto.subtle.verify(
      {
        name: "ECDSA",
        hash: { name: "SHA-256" },
      },
      key,
      base64ToBuffer(signature),
      base64ToBuffer(challenge)
    );
  }
}


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
