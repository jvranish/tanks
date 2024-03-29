import { Identity, PublicIdentity } from "./identity.js";
import { TimeChunkedEventQueue } from "./time-chunked-event-queue.js";
import { channelRecv, channelSend } from "./message.js";

/** @typedef {import("./message.js").Message} Message */
/** @typedef {import("./message.js").PeerMessage} PeerMessage */
/** @typedef {import("./message.js").SimulationMsg} SimulationMsg */
/** @typedef {import("./message.js").Diagnostic} Diagnostic */

export class Server {
  static defaultOptions() {
    return {
      now: performance.now(),
      tickPeriodMs: 50,
      tickChunkMs: 10,
    };
  }
  /**
   * @memberof Server
   * @param {string} clientId
   * @param {{ now: number; tickPeriodMs: number; tickChunkMs: number }} options
   * @param {string | null} [initialState]
   */
  constructor(clientId, options, initialState = null) {
    // This initial state is purely for diagnostics/replay purposes
    this.initialState = initialState;
    this.tickPeriodMs = options.tickPeriodMs;
    this.msgTime = 0;
    /** @type {TimeChunkedEventQueue<SimulationMsg>} */
    this.eventQueue = new TimeChunkedEventQueue({
      simTime: 0,
      tickPeriodMs: this.tickPeriodMs,
      timeChunkMs: options.tickChunkMs,
      now: options.now,
    });
    /** @type {{ [key: string]: RTCDataChannel }} */
    this.clients = {};
    this.clientId = clientId;

    /** @type {{ [key: string]: (diagnostics: Diagnostic[]) => void }} */
    this.diagnosticsCollectors = {};

    /** @type {number | null} */
    this.tickTimer = null;

    this.eventQueue.pushMsg({
      msg: { type: "peerJoined" },
      clientId: this.clientId,
      msgTime: this.msgTime,
    });
  }

  disconnect() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
    }
    for (let clientId of Object.keys(this.clients)) {
      this.onDisconnect(clientId);
    }
    this.eventQueue.endTicks();
  }

  getTickChunkMs() {
    return this.eventQueue.timeChunkMs;
  }

  start() {
    this.tickTimer = window.setInterval(() => {
      this.onTick();
    }, this.tickPeriodMs);
  }

  /**
   * @param {string} initialState
   * @param {Partial<ReturnType<Server.defaultOptions>>} [options]
   */
  static async init(initialState, options = {}) {
    const mergedOptions = { ...Server.defaultOptions(), ...options };
    const identity = await Identity.generate();
    const publicIdentity = await identity.publicId();
    const clientId = await publicIdentity.toName();
    const server = new Server(clientId, mergedOptions, initialState);
    server.start();
    return { server, identity, clientId };
  }

  onTick() {
    this.msgTime = this.msgTime + this.tickPeriodMs;
    this.eventQueue.processTick(this.msgTime);
    this.broadcast({ type: "tick", msgTime: this.msgTime });
  }

  getEvents(time = performance.now()) {
    return this.eventQueue.getEvents(time);
  }

  /**
   * This is use for sending both client events and server events
   *
   * @param {string} peerEvent
   */
  sendEvent(peerEvent) {
    this.sendClientEvent(this.clientId, peerEvent);
  }

  async collectDiagnostics() {
    this.broadcast({
      type: "peerMessage",
      msg: {
        type: "collectDiagnostics",
      },
      clientId: this.clientId,
      msgTime: this.msgTime,
    });

    const clients = Object.keys(this.clients).concat([this.clientId]);
    const diagnostics = await Promise.all(
      clients.map(
        (clientId) =>
          new Promise((resolve, reject) => {
            this.diagnosticsCollectors[clientId] = resolve;
            setTimeout(() => {
              reject(new Error("Diagnostics collection timed out"));
            }, 1000);
          })
      )
    );
    /** @type {Record<string, Diagnostic>} */
    const diagnosticsObj = {};
    for (let i = 0; i < clients.length; i++) {
      diagnosticsObj[clients[i]] = diagnostics[i];
    }

    this.diagnosticsCollectors = {};
    return { initialState: this.initialState, diagnostics: diagnosticsObj };
  }

  /**
   * @param {string} clientId
   * @param {Diagnostic[]} diagnostics
   */
  recordDiagnostics(clientId, diagnostics) {
    if (this.diagnosticsCollectors[clientId]) {
      this.diagnosticsCollectors[clientId](diagnostics);
    }
  }

  /** @param {Diagnostic[]} diagnostics */
  sendDiagnostics(diagnostics) {
    const clone = JSON.parse(JSON.stringify(diagnostics));
    this.diagnosticsCollectors[this.clientId](clone);
  }

  /**
   * @param {string} clientId
   * @param {string} peerEvent
   */
  sendClientEvent(clientId, peerEvent) {
    /** @type {PeerMessage} */
    const msg = {
      type: "peerEvent",
      peerEvent,
    };
    this.broadcast({
      type: "peerMessage",
      msg,
      clientId: clientId,
      msgTime: this.msgTime,
    });
  }
  /** @param {Message} msg */
  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (let clientId of Object.keys(this.clients)) {
      this.clients[clientId].send(data);
    }
    if (msg.type === "peerMessage") {
      this.eventQueue.pushMsg({
        msg: msg.msg,
        clientId: msg.clientId,
        msgTime: msg.msgTime,
      });
    }
  }
  /**
   * @param {RTCDataChannel} channel
   * @param {() => {
   *   state: string;
   *   diagnostics: Diagnostic[];
   * }} getState
   *   It's important that getState be a function because we need the state
   *   _after_ the initial handshake. This is because the state might change
   *   during the handshake.
   */
  async onConnect(channel, getState) {
    const { identity } = await channelRecv(channel, "identity");

    const publicIdentity = await PublicIdentity.fromJSON(identity);

    const { challenge, verify } = publicIdentity.challenge();

    channelSend(channel, { challenge }, "challenge");

    const { signature } = await channelRecv(channel, "signature");

    if (!(await verify(signature))) {
      throw new Error("Signature verification failed");
    }

    // The cool thing about this id is that it's generated by the client, and
    // can be shared with other clients, but we can verify it's not forged by
    // checking the signature
    const clientId = await publicIdentity.toName();

    if (this.clients[clientId]) {
      this.onDisconnect(clientId);
    }
    this.clients[clientId] = channel;
    channel.onclose = () => {
      this.onDisconnect(clientId);
    };
    channel.onerror = (e) => {
      console.error(e);
      this.onDisconnect(clientId);
    };
    channel.onmessage = (e) => {
      // Parse the message, on parse failure disconnect the client
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch (e) {
        console.error(e);
        this.onDisconnect(clientId);
        return;
      }

      if (msg.type === "peerEvent") {
        this.sendClientEvent(clientId, msg.peerEvent);
      } else if (msg.type === "diagnostics") {
        this.recordDiagnostics(clientId, msg.diagnostics);
      } else {
        console.error(`Unexpected message type: ${msg.type}`);
        this.onDisconnect(clientId);
      }
    };

    const { state, diagnostics } = getState();

    // The maximum size of a webrtc message is around 16kb, so if we want to support larger states
    // we need to chunk it up into smaller pieces
    const chunkSize = 1024;
    for (let i = 0; i < state.length; i += chunkSize) {
      const chunk = state.slice(i, i + chunkSize);
      const lastChunk = i + chunkSize >= state.length;
      channelSend(channel, { chunk, lastChunk }, "stateChunk");
    }

    channelSend(
      channel,
      {
        clientId,
        queue: this.eventQueue,
        diagnostics,
      },
      "connected"
    );

    this.broadcast({
      type: "peerMessage",
      msg: {
        type: "peerJoined",
      },
      clientId,
      msgTime: this.msgTime,
    });
  }

  /** @param {string} clientId */
  onDisconnect(clientId) {
    this.clients[clientId].onclose = null;
    this.clients[clientId].onerror = null;
    this.clients[clientId].onmessage = null;
    this.clients[clientId].close();
    delete this.clients[clientId];

    this.broadcast({
      type: "peerMessage",
      msg: {
        type: "peerLeft",
      },
      clientId,
      msgTime: this.msgTime,
    });
  }
}
