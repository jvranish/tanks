import { ETagMismatchError, KVError, TimeoutError } from "./error.js";
import {
  wait,
  decryptAES,
  encryptAES,
  generateKeyAES,
  isDeepEqual,
  computeKeyHash,
} from "./util.js";

/**
 * Performs a GET request and returns the JSON data and ETag value.
 *
 * @param {string} url - The URL to send the GET request to.
 * @returns {Promise<{ value: any; etag: string | null }>} An object containing
 *   the JSON data and the ETag value.
 * @throws {Error} If the request fails.
 */
async function simpleGet(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new KVError(`Request failed with status ${response.status}`);
  }

  const value = await response.json();
  const etag = response.headers.get("ETag");
  return { value, etag };
}

/**
 * Performs a POST request, if an etag is provided it will be a conditional
 * post, sending JSON data only if the ETag value matches.
 *
 * @param {string} url - The URL to send the POST request to.
 * @param {any} data - The data to send as JSON.
 * @param {string | undefined | null} [etag] - The ETag value to use for the
 *   conditional request.
 * @returns {Promise<Response>} The Response object.
 * @throws {ETagMismatchError} If the ETag condition fails.
 * @throws {Error} If the request fails for other reasons.
 */
async function simplePost(url, data, etag) {
  /** @type {Record<string, string>} */
  const headers = {
    "Content-Type": "application/json",
  };
  if (etag) {
    headers["If-Match"] = etag;
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });

  if (response.status === 412) {
    throw new ETagMismatchError("ETag mismatch");
  }

  if (!response.ok) {
    throw new KVError(`Request failed with status ${response.status}`);
  }

  return response;
}
//64 random hex characters
const foo = "b0b5b6b7b8b9babbbcbdbebfc0c1c2c3c4c5c6c7c8c9cacbcccdcecfd0d1d2d3";

/** @template T */
export class KVStore {
  /**
   * @param {CryptoKey} aesKey - The AES key used to encrypt the data.
   * @param {string} storeKey - The key to store encrypted values at.
   */
  constructor(aesKey, storeKey) {
    this.serviceUrl = "https://kv.valkeyrie.com/encrypted-store";
    this.aesKey = aesKey;
    this.storeKey = storeKey;
  }

  /**
   * Creates a new EncryptedValkeyrieKVStore with a new AES key. You can
   * optionally provide an initial value to store.
   *
   * @template T
   * @param {T | undefined} [initialValue]
   * @returns {Promise<KVStore<T>>}
   */
  static async newStore(initialValue) {
    const aesKey = await generateKeyAES();
    const storeKey = await computeKeyHash(aesKey);
    const store = new KVStore(aesKey, storeKey);
    if (initialValue !== undefined) {
      store.setValue(initialValue);
    }
    return store;
  }

  async getValue() {
    const { value: encryptedValue, etag } = await simpleGet(
      `${this.serviceUrl}/${this.storeKey}`
    );
    const decryptedValue = await decryptAES(this.aesKey, encryptedValue);
    return { value: decryptedValue, etag };
  }

  /**
   * @param {T} value
   * @param {string | undefined | null} [etag] - The ETag value to use for the
   *   conditional request.
   */
  async setValue(value, etag) {
    const encryptedValue = await encryptAES(this.aesKey, value);
    await simplePost(`${this.serviceUrl}/${this.storeKey}`, encryptedValue, etag);
  }

  /**
   * It waits for a new value to be set, and returns that new value
   *
   * We need to know the original value in order to prevent an update race
   * between a set and a follow up get.
   *
   * If we implemented a "wait for new value" that just did a `getValue`, and
   * then repeatedly called `getValue` until it got a different answer, it would
   * be very hard to prevent a race in the set-and-wait case.
   *
   * @param {T} oldValue - The original value.
   * @param {number} [timeout=5000] - The maximum time in milliseconds to wait
   *   for a new value before giving up. Default is 5000 ms (5 seconds). Default
   *   is `5000`. Default is `5000`
   * @returns {Promise<T>} The new value, after a change is detected.
   * @throws {TimeoutError} If the timeout is reached.
   */
  async waitForNewValue(oldValue, timeout = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const { value } = await this.getValue();
      if (!isDeepEqual(value, oldValue)) {
        return value;
      }

      // Wait for a short time before checking again
      await wait(250);
    }

    // No update to the value within the timeout period
    throw new TimeoutError(`No new value after ${timeout} milliseconds`);
  }

  /**
   * Try to merge the valueToMerge with the current value of key, using the
   * function f, and keep trying until the value doesn't change for 1.2 seconds.
   * Throws an exception on failure.
   *
   * This version of mergeValueWith takes advantage of ETag-based conditional
   * updates for better concurrency control.
   *
   * @template V
   * @param {V} valueToMerge - The value to merge with the existing value.
   * @param {(a: T, b: V) => Promise<T>} f - A function that takes the current
   *   value and the value to merge, and returns the merged value.
   * @returns {Promise<void>}
   */
  async mergeValueWith(valueToMerge, f) {
    let timeSinceLastUpdate = 0;

    for (let i = 0; i < 10; i++) {
      // Get the current value and ETag
      const { value: existingValue, etag } = await this.getValue();

      // Merge the existing value with the valueToMerge
      const mergedValue = await f(existingValue, valueToMerge);

      if (!isDeepEqual(existingValue, mergedValue)) {
        // If the mergedValue is different than what's stored, then update it.

        try {
          this.setValue(mergedValue);

          // If there is an ETag and the conditional POST succeeds, immediately return
          if (etag) {
            return;
          }
          timeSinceLastUpdate = 0;
        } catch (e) {
          if (e instanceof ETagMismatchError) {
            // If the condition failed, it means another client updated the value.
            // Continue with the next iteration to retry the merge.
            continue;
          }
          // If the error is not due to the condition, re-throw the error.
          throw e;
        }
      }

      if (!etag && timeSinceLastUpdate > 1200) {
        // If no values have needed updating for 1.2 seconds
        // then assume we've succeeded
        return;
      }

      // Wait at least 300ms (plus a random component to help avoid ties)
      const waitTime = 300 + 300 * Math.random();
      await wait(waitTime);
      timeSinceLastUpdate += waitTime;
    }

    throw new KVError("mergeValueWith failed to converge");
  }
}
