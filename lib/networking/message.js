/** @typedef {import("./time-chunked-event-queue.js").TimeChunkedEventQueue<SimulationMsg>} TimeChunkedEventQueue */

/**
 * @typedef {| { type: "peerJoined" }
 *   | { type: "peerLeft" }
 *   | { type: "collectDiagnostics" }
 *   | {
 *       type: "peerEvent";
 *       peerEvent: string;
 *     }} PeerMessage
 */

/**
 * @typedef {{
 *   msg: PeerMessage;
 *   clientId: string;
 *   msgTime: number;
 * }} SimulationMsg
 */

/** @typedef {{ updates: number; msgTime: number; dt: number }} CommonDiagnostic */

/** @typedef {{ type: "stateHash"; stateHash: number } & CommonDiagnostic} StateHashDiagnostic */
/**
 * @typedef {{
 *   type: "peerMessage";
 *   peerMessage: PeerMessage;
 *   clientId: string;
 * } & CommonDiagnostic} PeerMessageDiagnostic
 */

/** @typedef {StateHashDiagnostic | PeerMessageDiagnostic} Diagnostic */

/**
 * @typedef {| { type: "tick"; msgTime: number }
 *   | { type: "identity"; identity: { publicKey: string } }
 *   | { type: "challenge"; challenge: string }
 *   | { type: "signature"; signature: string }
 *   | { type: "stateChunk"; chunk: string; lastChunk: boolean }
 *   | {
 *       type: "connected";
 *       clientId: string;
 *       queue: TimeChunkedEventQueue;
 *       diagnostics: Diagnostic[];
 *     }
 *   | ({
 *       type: "peerMessage";
 *     } & SimulationMsg)} Message
 */

/**
 * @template {Message["type"]} T
 * @param {Omit<Extract<Message, { type: T }>, "type">} msg
 * @param {RTCDataChannel} channel
 * @param {T} msgType
 */
export async function channelSend(channel, msg, msgType) {
  channel.send(JSON.stringify({ type: msgType, ...msg }));
}

/**
 * @template {Message["type"]} T
 * @param {RTCDataChannel} channel
 * @param {T} msgType
 * @returns {Promise<Extract<Message, { type: T }>>}
 */
export async function channelRecv(channel, msgType) {
  const msg = await new Promise((resolve, reject) => {
    channel.onmessage = resolve;
    channel.onerror = reject;
    channel.onclose = reject;
  });
  const parsedMsg = JSON.parse(msg.data);

  if (parsedMsg.type !== msgType) {
    throw new Error(`Expected ${msgType}, got ${parsedMsg.type}`);
  }

  return parsedMsg;
}
