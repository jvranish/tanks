import { Key, KVStore } from "./kv-store.js";
import { Valkeyrie } from "./kv-stores/valkeyrie.js";
import { Dweet } from "./kv-stores/dweet.js";
import { KeyValueXYZ } from "./kv-stores/keyvaluexyz.js";
import { SimpleKV } from "./kv-stores/simplekv.js";
import { LocalKV } from "./kv-stores/local.js";

import {
  base64ToBuffer,
  bufferToBase64,
  decodeUrlSafe,
  decryptAES,
  encodeUrlSafe,
  encryptAES,
  exportKeyAES,
  generateKeyAES,
  importKeyAES,
} from "./util.js";
import { KVError } from "./error.js";

/** @type {KVStore<{ iv: string; data: string }>[]} */
export const defaultKvStores = [
  // new LocalKV(),
  new Valkeyrie(),
  // new KeyValueXYZ(),
  // new Dweet(),
  // new SimpleKV(),
];

/**
 * Wraps a key value store, and creates an encrypted store for just the given key.
 *
 * @template V
 */
export class EncryptedStore {
  /**
   * @param {KVStore<{ iv: string; data: string }>} kvStore - The key-value
   *   store that will be used to store encrypted values.
   * @param {CryptoKey} aesKey - The AES key used to encrypt the data.
   * @param {Key<KVStore<{ iv: string; data: string }>>} storeKey - The key to
   *   store encrypted values at
   */
  constructor(kvStore, aesKey, storeKey) {
    this.kv = kvStore;
    this.aesKey = aesKey;
    this.storeKey = storeKey;
  }

  get name() {
    return this.kv.name;
  }

  /** @returns {Promise<V>} */
  async getValue() {
    const encryptedValue = await this.kv.getValue(this.storeKey);
    const decryptedValue = await decryptAES(this.aesKey, encryptedValue);
    return decryptedValue;
  }

  /** @param {V} value */
  async setValue(value) {
    const encryptedValue = await encryptAES(this.aesKey, value);
    return this.kv.setValue(this.storeKey, encryptedValue);
  }

  /**
   * @param {V} oldValue
   * @param {number} [timeout=300] Timeout in seconds. Default is `300`
   * @returns {Promise<V>}
   */
  async waitForNewValue(oldValue, timeout = 300) {
    const encryptedOldValue = await encryptAES(this.aesKey, oldValue);
    const encryptedNewValue = await this.kv.waitForNewValue(
      this.storeKey,
      encryptedOldValue,
      timeout
    );
    return decryptAES(this.aesKey, encryptedNewValue);
  }

  /**
   * @template T
   * @param {T} valueToMerge
   * @param {(a: V, b: T) => Promise<V>} f
   * @returns {Promise<void>}
   */
  async mergeValueWith(valueToMerge, f) {
    /**
     * @param {{ iv: string; data: string }} encryptedExisting
     * @param {T} valueToMerge_
     * @returns {Promise<{ iv: string; data: string }>}
     */
    const mergeEncryptedValues = async (encryptedExisting, valueToMerge_) => {
      const existingValue = await decryptAES(this.aesKey, encryptedExisting);
      const mergedValue = await f(existingValue, valueToMerge_);

      // Check if raw merged value matches the raw original value, and if so,
      // return original encrypted value. If we don't do this (and just return
      // a new encrypted merged value) then we will never converge in
      // `this.kv.mergeValueWith` because encrypted values (even of identical
      // contents) are always different.
      if (JSON.stringify(mergedValue) === JSON.stringify(existingValue)) {
        return encryptedExisting;
      }
      const encryptedMerged = await encryptAES(this.aesKey, mergedValue);
      return encryptedMerged;
    };

    return this.kv.mergeValueWith(
      this.storeKey,
      valueToMerge,
      mergeEncryptedValues
    );
  }

  /**
   * Creates a url-safe token that can be sent to a peer, and then re-hydrated
   * using `fromToken` into a `EncryptedStore` that can communicate with this one.
   *
   * @returns {Promise<string>}
   */
  async toToken() {
    const rawAesKey = await exportKeyAES(this.aesKey);
    return encodeUrlSafe(
      JSON.stringify([this.name, bufferToBase64(rawAesKey), this.storeKey.data])
    );
  }

  /**
   * @template V
   * @param {string} token
   * @param {KVStore<{ iv: string; data: string }>[]} kvStores
   * @returns {Promise<EncryptedStore<V>>}
   */
  static async fromToken(token, kvStores = defaultKvStores) {
    // These are external inputs (not just the user, but "friends" of the
    //  user), so we should be careful with what we do with these
    // - aesKey should be ok, since I expect the crypto.subtle API to be
    // sufficiently hardened.
    // - We handle storeName in a safe way (we use it only to lookup value in
    // another table).
    // - The decodeUrlSafe and binaryToArray are simple and don't present
    // injection risks as far as I can tell.
    const [storeName, aesKeyBase64, storeKeyData] = JSON.parse(
      decodeUrlSafe(token)
    );
    const aesKey = await importKeyAES(base64ToBuffer(aesKeyBase64));
    const storeKey = new Key(storeKeyData);

    // Lookup store from our list
    const kvStore = kvStores.find((store) => store.name === storeName);

    if (!kvStore) {
      throw new KVError(`Could not find matching kvStore: ${storeName}`);
    }

    return new EncryptedStore(kvStore, aesKey, storeKey);
  }

  /**
   * @template V
   * @param {KVStore<{ iv: string; data: string }>} store
   * @returns {Promise<EncryptedStore<V>>}
   */
  static async newStore(store) {
    const aesKey = await generateKeyAES();
    const signalKey = await store.newKey();
    return new EncryptedStore(store, aesKey, signalKey);
  }

  /**
   * It creates a new store with the same kv service as the current store, and
   * sets the default value to the value passed in
   *
   * @template T
   * @param {T} defaultValue
   * @returns {Promise<EncryptedStore<T>>}
   */
  async newStoreWithSameKV(defaultValue) {
    const aesKey = await generateKeyAES();
    const signalKey = await this.kv.newKey();
    const store = new EncryptedStore(this.kv, aesKey, signalKey);
    await store.setValue(defaultValue);
    return store;
  }
}


