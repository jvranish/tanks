import { decodeUrlSafe, encodeUrlSafe, randomString } from "../util.js";
import { KVStore, Key } from "../kv-store.js";
import { KVError } from "../error.js";

/**
 * It gets and sets values in LocalStorage (useful for testing locally
 * without an internet connection)
 *
 * @template V
 * @extends {KVStore<V>}
 */
export class LocalKV extends KVStore {
  get name() {
    return "local";
  }

  /** @returns {Promise<Key<LocalKV<V>>>} */
  async newKey() {
    return new Key(randomString(15));
  }

  /**
   * @param {Key<LocalKV<V>>} key
   * @returns {Promise<V>}
   */
  async getValue(key) {
    const value = window.localStorage.getItem(key.data);
    if (!value) {
      throw new KVError("GET failed");
    }

    return JSON.parse(decodeUrlSafe(value));
  }

  /**
   * @param {Key<LocalKV<V>>} key
   * @param {V} value
   */
  async setValue(key, value) {
    const encoded = encodeUrlSafe(JSON.stringify(value));
    window.localStorage.setItem(key.data, encoded);
  }
}
