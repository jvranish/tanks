import { KVError } from "./error.js";
import { KVStore } from "./kv-store.js";
import { defaultKvStores, EncryptedStore } from "./encrypted-store.js";

export class EncryptedStoreFactory {
  /** @param {EncryptedStore<{}>} store */
  constructor(store) {
    this.store = store;
  }

  /**
   * @template T
   * @param {T} defaultValue
   * @returns {Promise<EncryptedStore<T>>}
   */
  async newStore(defaultValue) {
    return this.store.newStoreWithSameKV(defaultValue);
  }

  /**
   * It tries to create a new store with each of the given KV stores, and
   * returns the first one that succeeds. Returned store will initially contain
   * the value `{}`
   *
   * @template T
   * @param {KVStore<{ iv: string; data: string }>[]} [kvStores] - An array of
   *   KVStore objects.
   * @returns {Promise<EncryptedStoreFactory>} The first store that is able to
   *   set and get a value.
   */
  static async newFactory(kvStores = defaultKvStores) {
    try {
      return await Promise.any(
        kvStores.map(async (kvStore) => {
          /** @type {EncryptedStore<{}>} */
          const store = await EncryptedStore.newStore(kvStore);
          await store.setValue({});
          const value = await store.getValue();
          if (JSON.stringify(value) !== JSON.stringify({})) {
            throw new Error(
              `Expected empty value from ${store.name}, but got ${JSON.stringify(value)}`
            );
          }

          return new EncryptedStoreFactory(store);
        })
      );
    } catch ( /** @type {any} */e) {
      throw new KVError(
        `"Unable to find suitable key-value store": ${e.message}, ${e.errors}`
      );
    }
  }
}
