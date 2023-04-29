// @ts-check
// (good overview) https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity
// https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Simple_RTCDataChannel_sample
// https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addIceCandidate
// https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/icecandidate_event
// https://developer.mozilla.org/en-US/docs/Glossary/SDP

import enableConnectionLogs from "./webrtc-debug.js";

// - [x] simplify some of the wait-for-state handlers
// - [x] simplify names? (connection, source?)
// - [x] assert on message contents in tests
// - [x] add error subclasses
// - [x] use async queue for internal queue
// - [ ] jsdoc? (is this worth it? .... probably not?)
// - [ ] mocha tests?
// - [x] eslint?
// make answer start watching for fail earlier

export class WebRTCError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "WebRTCConnectError";
  }
}

/** @param {number} ms */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @template K
 * @template T
 * @callback Predicate
 * @param {RTCPeerConnection} source
 * @param {RTCPeerConnectionEventMap[K]} event
 * @param {(result: T) => void} done
 */

/**
 * @template {keyof RTCPeerConnectionEventMap} K
 * @template T
 * @param {RTCPeerConnection} source
 * @param {K} eventType
 * @param {Predicate<K, T>} predicate
 * @returns {Promise<T>}
 */
function waitForEvent(source, eventType, predicate) {
  return new Promise((resolve) => {
    /** @type {(result: T) => void} */
    let done;

    /** @param {RTCPeerConnectionEventMap[K]} event */
    const listener = (event) => predicate(source, event, done);
    done = (a) => {
      source.removeEventListener(eventType, listener);
      resolve(a);
    };
    source.addEventListener(eventType, listener);
  });
}

/**
 * @param {RTCPeerConnection} connection
 * @returns {Promise<void>}
 */
const waitForConnectionFailed = (connection) =>
  waitForEvent(
    connection,
    "iceconnectionstatechange",
    (source, event, done) => {
      if (source.iceConnectionState === "failed") {
        done();
      }
    }
  );

/**
 * @param {RTCPeerConnection} connection
 * @returns {Promise<void>}
 */
const waitIceComplete = (connection) =>
  waitForEvent(connection, "icegatheringstatechange", (source, event, done) => {
    console.log("icegatheringstatechange", source.iceGatheringState, event);
    if (source.iceGatheringState === "complete") {
      done();
    }
  });

/**
 * @param {string} name
 * @param {number} timeoutMsecs
 */
const connectionTimeout = async (name, timeoutMsecs) => {
  await wait(timeoutMsecs);
  throw new WebRTCError(`Timed out waiting to connect (${name})`);
};

/**
 * @param {string} name
 * @param {RTCPeerConnection} connection
 */
const iceFailed = async (name, connection) => {
  await waitForConnectionFailed(connection);
  throw new WebRTCError("Failed ICE negotiation");
};

const defaultIceServers = [
  {
    urls: "stun:stun.wtfismyip.com",
  },
];

/**
 * @param {RTCPeerConnection} connection
 * @param {RTCDataChannel} channel
 * @returns {Promise<RTCDataChannel>} ;
 */
function waitForOpen(connection, channel) {
  return new Promise((resolve) => {
    channel.addEventListener("open", () => {
      channel.addEventListener("close", () => {
        connection.close();
      });
      window.addEventListener("beforeunload", () => {
        channel.close();
      });
      resolve(channel);
    });
  });
}

export const startOffer = async ({
  name = "localPeer",
  iceServers = defaultIceServers,
  timeout = 15000,
} = {}) => {
  const connection = new RTCPeerConnection({
    iceServers,
  });
  enableConnectionLogs(name, connection);

  const channelOpen = waitForOpen(
    connection,
    connection.createDataChannel("dataChannel")
  );

  const offerInit = await connection.createOffer();
  await connection.setLocalDescription(offerInit);
  console.log("set local description");
  await waitIceComplete(connection);
  console.log("ICE complete");
  const offer = /** @type {RTCSessionDescription} */ (
    connection.localDescription
  );
  console.log("offer", offer);

  /** @param {RTCSessionDescription} answer; */
  const acceptAnswer = async (answer) => {
    await connection.setRemoteDescription(new RTCSessionDescription(answer));
    return Promise.race([
      channelOpen,
      connectionTimeout(name, timeout),
      iceFailed(name, connection),
    ]);
  };

  return { offer, acceptAnswer };
};

/**
 * @param {RTCPeerConnection} connection
 * @returns {Promise<RTCDataChannel>}
 */
const waitForDataChannel = (connection) =>
  waitForEvent(connection, "datachannel", (source, event, done) => {
    done(event.channel);
  });

/** @param {RTCSessionDescription} offer */
export const answerOffer = async (
  offer,
  { name = "localPeer", iceServers = defaultIceServers, timeout = 15000 } = {}
) => {
  const connection = new RTCPeerConnection({
    iceServers,
  });
  enableConnectionLogs(name, connection);

  await connection.setRemoteDescription(new RTCSessionDescription(offer));

  const answerInit = await connection.createAnswer();
  await connection.setLocalDescription(answerInit);
  await waitIceComplete(connection);
  const answer = /** @type {RTCSessionDescription} */ (
    connection.localDescription
  );
  console.log("answer", answer);

  const waitForChannel = async () => {
    const dataChannel = await waitForDataChannel(connection);
    return waitForOpen(connection, dataChannel);
  };
  const race = Promise.race([
    waitForChannel(),
    iceFailed(name, connection),
    connectionTimeout(name, timeout),
  ]);

  const waitForConnect = () => race;

  return { answer, waitForConnect };
};
