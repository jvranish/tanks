import { assertEq } from "../test-helpers.js";
import { KVStore } from "./kv-store.js";

/**
 * @template T
 * @param {T} msg Message to send
 * @param {number} [timeout] Timeout in seconds, default is 300
 * @returns {Promise<{ token: string; waitForResponse: () => Promise<T> }>}
 */
export async function start(msg, timeout = 300) {
  const store = await KVStore.newStore(msg);
  const waitForResponse = async () => await store.waitForNewValue(msg, timeout);
  const token = await store.toToken();
  return { token, waitForResponse };
}

/**
 * @template T
 * @param {string} token
 * @returns {Promise<{
 *   msg: T;
 *   sendResponse: (resp: T) => Promise<void>;
 * }>}
 */
export async function fromToken(token) {
  const store = await KVStore.fromToken(token);
  const {value: msg} = await store.getValue();
  const sendResponse = async (/** @type {T} */ response) => {
    await store.setValue(response);
  };
  return { msg, sendResponse };
}
