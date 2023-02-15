export class AssertError extends Error {
  constructor(/** @type {string} */ message) {
    super(message);
    this.name = "AssertError";
  }
}

/**
 * @param {boolean} p Predicate to assert on
 * @param {string} msg Message to include in the assert error exception
 */
export function assert(p, msg) {
  if (!p) {
    console.error(msg);
    throw new AssertError(msg);
  }
}

/**
 * Shallow compares two values and asserts if they are not equal
 *
 * @template T
 * @param {T} a
 * @param {T} b
 */
export function assertEq(a, b) {
  if (a !== b) {
    const errorMsg = `Expected ${a} to shallow equal ${b}`;
    console.error(errorMsg);
    throw new AssertError(errorMsg);
  }
}

/**
 * Returns a function that returns a promise that resolves when the function is
 * called `n` times (and errors if called more than `n` times). See
 * [Barrier](https://en.wikipedia.org/wiki/Barrier_(computer_science)). This is
 * useful in async tests to create points were separate async "tasks" will wait
 * for all other tasks to reach the barrier before continuing
 *
 * @param {number} [n=2] The number of times the returned function must be
 *   called before the promise resolves. Default is `2`
 * @returns {() => Promise<void>} A function that returns a promise.
 */
export function barrier(n = 2) {
  /** @type {() => void} */
  let r;
  /** @type {Promise<void>} */
  const p = new Promise((resolve) => {
    r = resolve;
  });
  let count = 0;
  return () => {
    count += 1;
    if (count === n) {
      r();
    } else if (count >= n) {
      throw Error(`sync called more than ${n} times`);
    }
    return p;
  };
}

/**
 * Similar to `barrier` but returns a pair of functions. `send` must be called
 * once, `recv` must be called `n-1` times. The value given to `send` will be
 * received by all the `recv` calls once `n-1` receive calls have been made.
 *
 * @template T
 * @param {number} [n=2] The cumulative number of times that `send` and `recv`
 *   must be called. Default is `2`
 * @returns {{ send: (msg: T) => Promise<T>; recv: () => Promise<T> }}
 */
export function barrierMsg(n = 2) {
  /** @type {(value: T) => void} */
  let r;
  /** @type {Promise<T>} */
  const p = new Promise((resolve) => {
    r = resolve;
  });
  /** @type {{ msg: T }} */
  let m;
  let count = 0;

  const recv = () => {
    count += 1;
    if (count === n) {
      if (m) {
        r(m.msg);
      } else {
        throw Error(`recv called ${n} times, but send was never called`);
      }
    } else if (count >= n) {
      throw Error(`sync called more than ${n} times`);
    }
    return p;
  };
  /** @type {(msg: T) => Promise<T>} } */
  const send = (msg) => {
    m = { msg };
    return recv();
  };
  return { send, recv };
}
