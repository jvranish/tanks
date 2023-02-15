import { randomString } from "../util.js";
import { KVStore, simplePost, simpleGet, Key } from "../kv-store.js";

/**
 * An implementation of KVStore for the Valkeyrie service
 *
 * @template V
 * @extends {KVStore<V>}
 */
export class Valkeyrie extends KVStore {
  get name() {
    return "valkeyrie";
  }

  /** @returns {Promise<Key<Valkeyrie<V>>>} */
  async newKey() {
    return new Key(randomString(15));
  }

  /**
   * It gets the value of a key from the Valkeyrie key-value cache
   *
   * @param {Key<Valkeyrie<V>>} key - The key to get the value of.
   * @returns {Promise<V>} The value of the key
   */
  async getValue(key) {
    return (await simpleGet(`https://kv.valkeyrie.com/${key.data}`)).json();
  }

  /**
   * It sets the value of a key in the Valkeyrie key-value cache and value
   *
   * @param {Key<Valkeyrie<V>>} key - The key to store the value under.
   * @param {V} value - The value to set.
   */
  async setValue(key, value) {
    await simplePost(`https://kv.valkeyrie.com/${key.data}`, value);
  }
}
