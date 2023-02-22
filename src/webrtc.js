// @ts-check
// (good overview) https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity
// https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Simple_RTCDataChannel_sample
// https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addIceCandidate
// https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/icecandidate_event
// https://developer.mozilla.org/en-US/docs/Glossary/SDP

// - [x] simplify some of the wait-for-state handlers
// - [x] simplify names? (connection, source?)
// - [x] assert on message contents in tests
// - [x] add error subclasses
// - [x] use async queue for internal queue
// - [ ] jsdoc? (is this worth it? .... probably not?)
// - [ ] mocha tests?
// - [x] eslint?
// make answer start watching for fail earlier

// Can I make a cheap way to bypass the queue? Construct Channel with a callback handler?
import { Queue } from "./queue.js";

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
    urls: "stun:stun.stunprotocol.org",
  },
  {
    urls: "stun:stun.wtfismyip.com",
  },
];

export class Channel {
  /**
   * @param {RTCPeerConnection} connection
   * @param {RTCDataChannel} channel
   */
  constructor(connection, channel) {
    /** @type {RTCPeerConnection | undefined} */
    this.connection = connection;
    /** @type {RTCDataChannel | undefined} */
    this.channel = channel;
    /** @type {Queue<string | null>} */
    this.queue = new Queue();
    /** @type {(msg: string | null) => void} */
    this.onData = (msg) => this.queue.push(msg);
    this.channel.onmessage = (event) => this.onData(event.data);
    this.channel.onclose = () => {
      delete this.channel;
      if (this.connection) {
        this.connection.close();
      }
      delete this.connection;
      this.onData(null);
    };
  }

  /**
   * You should either use this function _or_ `recv()` but not both
   *
   * @param {(msg: string | null) => void} f
   */
  setOnDataHandler(f) {
    this.onData = f;
    this.queue.drain(f);
  }

  /**
   * @param {RTCPeerConnection} connection
   * @param {RTCDataChannel} channel
   * @returns {Promise<Channel>} ;
   */
  static waitForOpen(connection, channel) {
    return new Promise((resolve) => {
      const c = new Channel(connection, channel);
      // eslint-disable-next-line no-param-reassign
      channel.onopen = () => {
        resolve(c);
      };
    });
  }

  /** You should either use this function or `setOnDataHandler` but not both */
  async recv() {
    return await this.queue.pop();
  }

  /** @param {string} message */
  send(message) {
    if (this.channel) {
      this.channel.send(message);
    }
  }

  close() {
    if (this.channel) {
      this.channel.close();
    }
  }
}

export const startOffer = async ({
  name = "localPeer",
  iceServers = defaultIceServers,
  timeout = 15000,
} = {}) => {
  const connection = new RTCPeerConnection({
    iceServers,
  });

  const channel = Channel.waitForOpen(
    connection,
    connection.createDataChannel("dataChannel")
  );

  const offerInit = await connection.createOffer();
  await connection.setLocalDescription(offerInit);
  await waitIceComplete(connection);
  const offer = /** @type {RTCSessionDescription} */ (
    connection.localDescription
  );
  console.log("offer", offer);

  /** @param {RTCSessionDescription} answer; */
  const acceptAnswer = async (answer) => {
    await connection.setRemoteDescription(new RTCSessionDescription(answer));
    return Promise.race([
      channel,
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
    return Channel.waitForOpen(connection, dataChannel);
  };
  const race = Promise.race([
    waitForChannel(),
    iceFailed(name, connection),
    connectionTimeout(name, timeout),
  ]);

  const waitForConnect = () => race;

  return { answer, waitForConnect };
};
