
import { tests, TEST_TIMEOUT } from "./test-helpers.js";

export async function runTests() {
  const startTime = Date.now();
  const testPromises = [];

  for (const test of tests) {
    for (const itBlock of test.itBlocks) {
      /** @type {Promise<{ testDesc: string; itDesc: string; passed: boolean; error?: any }> } */
      const promise = new Promise(async (resolve, reject) => {
        try {
          await Promise.race([
            itBlock.fn(),
            new Promise((_, reject) =>
              setTimeout(() => reject("Timeout"), TEST_TIMEOUT)
            ),
          ]);
          resolve({ testDesc: test.desc, itDesc: itBlock.desc, passed: true });
        } catch (error) {
          resolve({
            testDesc: test.desc,
            itDesc: itBlock.desc,
            passed: false,
            error,
          });
        }
      })
      .then((result) => {
        if (result.passed) {
          console.log(`✔ ${result.testDesc}: ${result.itDesc}`);
        } else {
          console.error(`✘ ${result.testDesc}: ${result.itDesc} - ${result.error}:\n ${result.error.stack}`);
        }
        return result;
      });
      testPromises.push(promise);
    }
  }

  const testResults = await Promise.all(testPromises);

  const endTime = Date.now();
  const duration = endTime - startTime;

  console.log(`Finished running ${testResults.length} tests in ${duration}ms`);

  testResults.forEach((result) => {
    if (result.passed) {
      console.log(`✔ ${result.testDesc}: ${result.itDesc}`);
    } else {
      console.error(`✘ ${result.testDesc}: ${result.itDesc} - ${result.error}:\n ${result.error.stack}`);
    }
  });
}
