import { runTests } from "./test-runner.js";
import "../lib/signaling-service/signaling-tests.js";
import "../lib/webrtc/webrtc-tests.js";
import "../lib/crypto/identity-tests.js";
import "../lib/networking/networking-test.js";


runTests();
