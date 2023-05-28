import { KVStore } from "./kv-store.js";

/**
 * @template T
 * @param {T} msg Message to send
 * @param {number} [timeout] Timeout in milliseconds, default is 10000
 * @returns {Promise<{ token: string; waitForResponse: () => Promise<T> }>}
 */
export async function start(msg, timeout = 10000) {
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
