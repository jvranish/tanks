import { Identity } from "./identity.js";
import { TimeChunkedEventQueue } from "./time-chunked-event-queue.js";
import { channelRecv, channelSend } from "./message.js";

/** @typedef {import("./message.js").Message} Message */
/** @typedef {import("./message.js").PeerMessage} PeerMessage */

export class Client {
  /**
   * @param {{
   *   channel: RTCDataChannel;
   *   clientId: string;
   *   queue: TimeChunkedEventQueue<{
   *     msg: PeerMessage;
   *     clientId: string;
   *     msgTime: number;
   *   }>;
   * }} init
   */
  constructor({ channel, clientId, queue }) {
    this.eventQueue = queue;
    this.channel = channel;
    this.clientId = clientId;
  }

  getTickChunkMs() {
    return this.eventQueue.timeChunkMs;
  }

  /** @param {string} peerEvent */
  sendEvent(peerEvent) {
    const msg = JSON.stringify({ type: "peerEvent", peerEvent });
    this.channel.send(msg);
  }

  /**
   * @template D
   * @param {D} diagnostics
   */
  sendDiagnostics(diagnostics) {
    const msg = JSON.stringify({ type: "diagnostics", diagnostics });
    this.channel.send(msg);
  }

  getEvents(time = performance.now()) {
    return this.eventQueue.getEvents(time);
  }

  disconnect() {
    this.channel.close();
  }

  /**
   * Will throw an error on connection failure
   * @param {RTCDataChannel} channel
   * @param {Identity} [identity]
   * @returns {Promise<{
   *   client: Client;
   *   clientId: string;
   *   state: string;
   *   diagnostics: import("./message.js").Diagnostic[];
   *   identity: Identity;
   * }>}
   */
  static async init(channel, identity = undefined) {
    if (!identity) {
      identity = await Identity.generate();
    }
    const publicIdentity = await identity.publicId();

    channelSend(channel, { identity: publicIdentity.toJSON() }, "identity");

    const { challenge } = await channelRecv(channel, "challenge");

    channelSend(channel, await identity.signChallenge(challenge), "signature");

    let state = "";

    while(true) {
      let {chunk, lastChunk} = await channelRecv(channel, "stateChunk");
      state += chunk;
      if (lastChunk) {
        break;
      }
    }

    const { clientId, queue, diagnostics } = await channelRecv(
      channel,
      "connected"
    );

    const client = new Client({
      channel,
      clientId,
      queue: Object.setPrototypeOf(queue, TimeChunkedEventQueue.prototype),
    });

    channel.onmessage = (e) => {
      // Parse the message and add it to the event queue
      // on parse failure end the ticks (which will be interpreted as a disconnect by the server)
      try {
        /** @type {Message} */
        const msg = JSON.parse(e.data);
        if (msg.type === "peerMessage") {
          client.eventQueue.pushMsg({
            msg: msg.msg,
            clientId: msg.clientId,
            msgTime: msg.msgTime,
          });
        } else if (msg.type === "tick") {
          client.eventQueue.processTick(msg.msgTime);
        } else {
          throw new Error(`Unexpected message type: ${msg.type}`);
        }
      } catch (e) {
        console.error(e);
        channel.close();
      }
    };

    channel.onclose = () => {
      client.eventQueue.endTicks();
    };

    channel.onerror = (e) => {
      console.error(e);
      client.eventQueue.endTicks();
    };

    return { client, clientId, state, diagnostics, identity };
  }
}
