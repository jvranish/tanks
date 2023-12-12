/**
 * Ensures that an object is an instance of a given class.
 *
 * @template T The class type to check against.
 * @param {object | null} obj - The object to be checked.
 * @param {new (...args: any[]) => T} t - The class constructor to check
 *   against.
 * @returns {T} The object if it is an instance of the specified class.
 * @throws {Error} Throws an error if the object is not an instance of the
 *   specified class.
 */
export function validateInstanceOf(obj, t) {
  if (!(obj instanceof t)) {
    throw new Error(`Expected ${t.name} but got ${obj}`);
  }
  return obj;
}
