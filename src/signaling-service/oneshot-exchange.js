import { assertEq } from "../test-helpers.js";
import { EncryptedStoreFactory } from "./encrypted-store-factory.js";
import { defaultKvStores, EncryptedStore } from "./encrypted-store.js";
import { KVStore } from "./kv-store.js";

/**
 * @template T
 * @param {T} msg Message to send
 * @param {number} [timeout] Timeout in seconds, default is 300
 * @param {EncryptedStoreFactory} [factory] Factory to build a new store from
 * @returns {Promise<{ token: string; waitForResponse: () => Promise<T> }>}
 */
export async function start(msg, timeout = 300, factory) {
  if (!factory) {
    factory = await EncryptedStoreFactory.newFactory();
  }
  const store = await factory.newStore(msg);
  const waitForResponse = async () => await store.waitForNewValue(msg, timeout);
  const token = await store.toToken();
  return { token, waitForResponse };
}

/**
 * @template T
 * @template U
 * @param {T} msg Message to send
 * @param {EncryptedStore<U>} store store to use
 * @param {number} [timeout] Timeout in seconds, default is 300
 * @returns {Promise<{ token: string; waitForResponse: () => Promise<T> }>}
 */
export async function startWithStore(msg, store, timeout = 300) {
  const newStore = await store.newStoreWithSameKV(msg);
  const waitForResponse = async () => await newStore.waitForNewValue(msg, timeout);
  const token = await newStore.toToken();
  return { token, waitForResponse };
}

/**
 * @template T
 * @param {string} token
 * @param {KVStore<{ iv: string; data: string }>[]} [kvStores]
 * @returns {Promise<{
 *   msg: T;
 *   sendResponse: (resp: T) => Promise<void>;
 * }>}
 */
export async function fromToken(token, kvStores = defaultKvStores) {
  const store = await EncryptedStore.fromToken(token, kvStores);
  /** @type {T} */
  const msg = await store.getValue();
  const sendResponse = async (/** @type {T} */ response) => {
    await store.setValue(response);
  };
  return { msg, sendResponse };
}

export async function OneshotExchangeTest() {
  const factory = await EncryptedStoreFactory.newFactory();
  const testMsg = { test: "asdf" };
  const { token, waitForResponse } = await start(testMsg, 300, factory);

  const { msg, sendResponse } = await fromToken(token);
  assertEq(msg.test, "asdf");
  const testResponse = { test: "foo" };

  await sendResponse(testResponse);
  const response = await waitForResponse();
  assertEq(response.test, "foo");
}
