import { Key, KVStore, simplePost, simpleGet } from "../kv-store.js";
import { randomString } from "../util.js";
/**
 * An implementation of `KVStore` for the keyvalue.xyz service
 *
 * @template V
 * @extends {KVStore<V>}
 */
export class KeyValueXYZ extends KVStore {
  get name() {
    return "keyvalue";
  }

  /**
   * The keyvalue.xyz service requires you to request new keys rather than
   * generating your own
   *
   * @returns {Promise<Key<KeyValueXYZ<V>>>}
   */
  async newKey() {
    const key = randomString(7);
    const endpoint = await (
      await simplePost(`https://api.keyvalue.xyz/new/${key}`, "")
    ).text();
    const found = endpoint.match(
      /https:\/\/api\.keyvalue\.xyz\/(?<token>[a-zA-Z0-9_-]+)\/(?<key>[a-zA-Z0-9_-]+)/
    );
    if (found?.groups?.token && found?.groups?.key === key) {
      return new Key(JSON.stringify([found.groups.token, found.groups.key]));
    }
    throw Error("Failed to generate new key");
  }

  /**
   * @param {Key<KeyValueXYZ<V>>} tokenAndKey
   * @returns {Promise<V>}
   */
  async getValue(tokenAndKey) {
    const [token, key] = JSON.parse(tokenAndKey.data);
    return (await simpleGet(`https://api.keyvalue.xyz/${token}/${key}`)).json();
  }

  /**
   * @param {Key<KeyValueXYZ<V>>} tokenAndKey
   * @param {V} value
   */
  async setValue(tokenAndKey, value) {
    const [token, key] = JSON.parse(tokenAndKey.data);
    await simplePost(`https://api.keyvalue.xyz/${token}/${key}`, value);
  }
}
