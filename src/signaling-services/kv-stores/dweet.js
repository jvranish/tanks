import { randomString, wait } from "../util.js";
import { Key, KVStore } from "../kv-store.js";

/**
 * An implementation of `KVStore` for the Dweet.io service
 *
 * @template V
 * @extends {KVStore<V>}
 */
export class Dweet extends KVStore {
  get name() {
    return "dweet";
  }

  /** @returns {Promise<Key<Dweet<V>>>} */
  async newKey() {
    return new Key(randomString(15));
  }

  /**
   * It tries to fetch the value from the store, and if it fails because of a
   * rate limit, it waits a random amount of time and tries again
   *
   * @param {Request} request - The request to fetch.
   * @returns {Promise<V>} The body of the response.
   */
  async #dweetFetch(request) {
    for (let i = 0; i < 5; i += 1) {
      await wait(500); // dweet's rate limit is pretty harsh
      const response = await fetch(request.clone());
      if (response.ok) {
        const body = await response.json();
        if (body?.this === "succeeded") {
          if (request.method === "POST") {
            return body.with.content;
          } else {
            return body.with[0].content;
          }
        }
        if (body?.because?.toLowerCase().includes("rate limit")) {
          // wait at least 1 second, plus a random exponential backoff
          await wait(1000 + 1000 * Math.random() * (1 << i));
          continue;
        } else {
          console.error(body);
          break;
        }
      } else {
        console.error(response);
        break;
      }
    }
    throw new Error("Failed to get value from store");
  }

  /**
   * @param {Key<Dweet<V>>} key
   * @returns {Promise<V>}
   */
  async getValue(key) {
    return this.#dweetFetch(
      new Request(`https://dweet.io/get/latest/dweet/for/${key.data}`)
    );
  }

  /**
   * @param {Key<Dweet<V>>} key
   * @param {V} value
   */
  async setValue(key, value) {
    await this.#dweetFetch(
      new Request(`https://dweet.io/dweet/quietly/for/${key.data}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(value),
      })
    );
  }

  /**
   * @param {Key<Dweet<V>>} key
   * @returns {Promise<V>}
   */
  async waitForNewValue(key) {
    const response = await fetch(
      new Request(`https://dweet.io/listen/for/dweets/from/${key.data}`)
    );
    if (!response.ok) {
      console.error(response);
      throw new Error("Failed to get value from store");
    }
    // I can't figure out how to get data out of the chunked response via the
    // fetch API. The `await bodyReader.read()`, never returns, I suspect because
    // it's waiting for some internal buffer to fill. So I just do another `getValue`
    // once we get an initial response
    return this.getValue(key);
  }
}
