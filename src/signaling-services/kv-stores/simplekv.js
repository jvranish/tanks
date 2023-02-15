import { decodeUrlSafe, encodeUrlSafe, randomString } from "../util.js";
import { KVStore, simplePost, simpleGet, Key } from "../kv-store.js";

/**
 * It gets and sets values in the SimpleKV key-value store
 *
 * @template V
 * @extends {KVStore<V>}
 */
export class SimpleKV extends KVStore {
  get name() {
    return "simplekv";
  }

  /** @returns {Promise<Key<SimpleKV<V>>>} */
  async newKey() {
    return new Key(randomString(15));
  }

  /**
   * @param {Key<SimpleKV<V>>} key
   * @returns {Promise<V>}
   */
  async getValue(key) {
    const value = await (await simpleGet(`https://simplekv.com/${key.data}`)).text();

    return JSON.parse(decodeUrlSafe(value));
  }

  /**
   * @param {Key<SimpleKV<V>>} key
   * @param {V} value
   */
  async setValue(key, value) {
    const encoded = encodeUrlSafe(JSON.stringify(value));
    await simplePost(`https://simplekv.com/${key.data}?v=${encoded}`, "");
  }
}
