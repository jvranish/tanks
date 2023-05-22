import { KVStore } from "./kv-store.js";
import { assert, assertEq } from "../../test/test-helpers.js";

/** @typedef {"connecting" | "waiting" | undefined} ConnectState */

/**
 * Merge two connecting states, such that the state is forced to "progress"
 *
 * @param {ConnectState} a
 * @param {ConnectState} b
 * @returns {ConnectState}
 */
function mergeConnectingStates(a, b) {
  if (b === undefined || a === undefined) {
    return undefined;
  } else if (a === "connecting" || b === "connecting") {
    return "connecting";
  } else {
    return "waiting";
  }
}

/**
 * Helper to assist with making object merge functions. Merges objects `a` and
 * `b`. The resulting object will contain the union of keys from both. If a key
 * exists in both `a` and `b`, `f` will be called to merged their values. If the
 * value return from `f` is `undefined` then the corresponding key will be
 * removed from the merged object.
 *
 * @template T
 * @param {{ [k: string]: T }} a
 * @param {{ [k: string]: T }} b
 * @param {(a: T, b: T) => T | undefined} f
 * @returns
 */
function mergeObjectWith(a, b, f) {
  const result = Object.assign({}, a);

  for (let k in b) {
    const merged = Object.hasOwn(result, k) ? f(result[k], b[k]) : b[k];
    // This also works as just `result[k] = merged;`, but I thought
    // I'd be more explicit here:
    if (merged === undefined) {
      delete result[k];
    } else {
      result[k] = merged;
    }
  }
  return result;
}

/**
 * A synchronization primitive that provides a mechanism for multiple "clients"
 * to signal their desire to connect to the owner of the waiting list. It allows
 * a single string to be transferred from the client to the owner. Any string
 * can be use, but the use case I had in mind was sending a token from a
 * OneshotExchange and then using that start a webRTC connection.
 *
 * It is carefully designed to allow multiple clients to attempt to connect
 * simultaneously without getting stuck or dropping entries.
 *
 * @example
 *   // The "server" creates a new waiting list:
 *   const waitingList = await WaitingList.start();
 *   // Creates a token from the resulting waiting list:
 *   const token = waitingList.toToken();
 *   // Send token to other peers using some other out-of-band method
 *   // (i.e. put the token in a link that the user can copy and paste to their
 *   // friends on discord)
 *   // Then call `take()` periodically to find new connecting clients:
 *   clientTokens = await waitingList.take();
 *   // in this case we're using OneshotExchange tokens:
 *   for (const token of clientTokens) {
 *     const msg, sendResponse = await OneshotExchange.fromToken(token);
 *     // then do stuff with the message we got and send a response
 *     const response = await doStuff(msg);
 *     await sendResponse(response);
 *   }
 *   //
 *   // -----------------------------
 *   //
 *   // on the "client", convert token to waiting list:
 *   const waitingList = await WaitingList.fromToken(token);
 *   // Then put in a token from a OneshotExchange:
 *   const token, waitForResponse = OneshotExchange.start(msg);
 *   const cleanup = await waitingList.put(token);
 *   // Wait for the server to `take()` our token and then respond to our oneshot
 *   const response = await waitForResponse();
 *   // then cleanup (we should call cleanup)
 *   await cleanup();
 *   // then do stuff with the response
 *   doStuff(response);
 */
export class WaitingList {
  constructor(
    /** @type {KVStore<{ [k: string]: ConnectState }>} */ store
  ) {
    this.store = store;
  }

  static async start() {
    /** @type {{ [k: string]: ConnectState }} */
    const initialValue = {};
    const store = await KVStore.newStore(initialValue);
    return new WaitingList(store);
  }

  async toToken() {
    return this.store.toToken();
  }

  /**
   * @param {string} token
   * @returns {Promise<WaitingList>}
   */
  static async fromToken(token) {
    /** @type {KVStore<{ [k: string]: ConnectState }>} */
    const store = await KVStore.fromToken(token);
    return new WaitingList(store);
  }

  /**
   * Add an entry to the waiting list. Caller should call the returned
   * `cleanup()` function once the entry is no longer needed (usually once a
   * response has been heard).
   *
   * @param {string} entry - Any string will do. Will be retrieved by the owner
   *   by calling `take()`
   * @returns {Promise<() => Promise<void>>} - A cleanup function to call once
   *   the entry is no longer needed.
   */
  async put(entry) {
    /** @type {{ [k: string]: ConnectState }} */
    // Key starts in the `waiting` state.
    const update = { [entry]: "waiting" };
    await this.store.mergeValueWith(
      update,
      async (a, b) => await mergeObjectWith(a, b, mergeConnectingStates)
    );
    return async () => await this.#cleanup(entry);
  }

  /**
   * Removes an entry from the waiting list. Only called through the return
   * value of `put()`
   *
   * @param {string} key
   */
  async #cleanup(key) {
    /** @type {{ [k: string]: ConnectState }} */
    const update = { [key]: undefined };
    await this.store.mergeValueWith(
      update,
      async (a, b) => await mergeObjectWith(a, b, mergeConnectingStates)
    );
  }

  /**
   * Take out all the entries that are currently waiting in the waiting list.
   * Will not return duplicates if called again.
   *
   * @returns {Promise<string[]>} All the entries currently waiting
   */
  async take() {
    // Returns all the keys in the `waiting` state, after transitioning them to `connecting`
    /** @type {string[]} */
    const waitingPeers = [];
    const {value: m} = await this.store.getValue();
    /** @type {{ [k: string]: ConnectState }} */
    const update = {};
    for (let k in m) {
      if (m[k] === "waiting") {
        waitingPeers.push(k);
        update[k] = "connecting";
      }
    }

    if (waitingPeers.length !== 0) {
      await this.store.mergeValueWith(
        update,
        async (a, b) => await mergeObjectWith(a, b, mergeConnectingStates)
      );
    }

    return waitingPeers;
  }
}
