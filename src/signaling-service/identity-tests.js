import { Identity } from "./identity.js";
import { assert, assertEq, describe, it } from "../test-helpers.js";

describe("Identity Tests", function () {
  it("Can verify challenge", async function () {
    let id = await Identity.generate();

    let publicId = await id.publicId();
    // Can I just sign my own public key? (nope)

    let { challenge, verify } = publicId.challenge();

    let { signature } = await id.signChallenge(challenge);

    await verify(signature);
  });
});
