import { Identity } from "../signaling-service/identity.js";
import { connect } from "../webrtc/webrtc-sockets.js";
import { TimeChunkedEventQueue, channelRecv, channelSend } from "./time-chunked-event-queue.js";



/**
 * @template E
 * @extends TimeChunkedEventQueue<E>
 */
export class Client extends TimeChunkedEventQueue {
  /**
   * @param {{
   *   channel: RTCDataChannel;
   *   clientId: string;
   *   simTime: number;
   *   tickPeriodMs: number;
   *   timeChunkMs: number;
   *   now?: number;
   * }} init
   */
  constructor({
    channel,
    clientId,
    simTime,
    tickPeriodMs,
    timeChunkMs,
    now = performance.now(),
  }) {
    super({ simTime, tickPeriodMs, timeChunkMs, now });
    this.channel = channel;
    this.clientId = clientId;
  }

  /** @param {E} peerEvent */
  sendEvent(peerEvent) {
    const msg = JSON.stringify(peerEvent);
    this.channel.send(msg);
  }

  /**
   * @template S,E
   * @param {string} token
   * @param {number} [timeout]
   * @returns {Promise<{
   *   client: Client<E>;
   *   clientId: string;
   *   state: S;
   *   identity: Identity;
   * }>}
   */
  static async connect(token, timeout = 15000) {
    const channel = await connect(token, timeout);

    const identity = await Identity.generate();
    const publicIdentity = await identity.publicId();

    channelSend(channel, { identity: publicIdentity.toJSON() }, "identity");

    const { challenge } = await channelRecv(channel, "challenge");

    channelSend(channel, await identity.signChallenge(challenge), "signature");

    const { clientId, simTime, tickPeriodMs, timeChunkMs, state } =
      await channelRecv(channel, "connected");

    const client = new Client({
      channel,
      clientId,
      simTime,
      tickPeriodMs,
      timeChunkMs,
      now: 0,
    });

    channel.onmessage = (e) => {
      /** @type {import("./time-chunked-event-queue").Message<S, E>} */
      const msg = JSON.parse(e.data);
      console.log("recv", clientId, msg);
      if (msg.type === "peerMessage") {
        client.recvMsg(msg.msg);
      } else if (msg.type === "tick") {
        client.processTick(msg.simTime);
      } else {
        throw new Error(`Unexpected message type: ${msg.type}`);
      }
    };

    channel.onclose = () => {
      client.recvMsg({ type: "disconnected", simTime: client.simTime });
      client.processTick(client.simTime + tickPeriodMs);
    };

    channel.onerror = (e) => {
      console.error(e);
      client.recvMsg({ type: "disconnected", simTime: client.simTime });
      client.processTick(client.simTime + tickPeriodMs);
    };

    return { client, clientId, state, identity };
  }
}
