import { Client } from "./client.js";
import { Identity } from "./identity.js";
import { Server } from "./server.js";

/**
 * @template OE - Output events (often sent to the UI)
 * @typedef {Object} NetworkedGameHandlers
 * @property {(clientId: string) => void} onPlayerJoined - Handle a new player
 *   joining the game.
 * @property {(clientId: string) => void} onPlayerLeft - Handle a player leaving
 *   the game.
 * @property {(clientId: string, event: string) => void} onEvent - Handle an
 *   event from a player.
 * @property {(dt: number) => OE[]} update - Run the game forward by dt seconds.
 * @property {() => string} serialize - Serialize
 */

/**
 * I just need a very simple checksum function that's _not_ async, because I
 * call this in locations where I need to guarantee an in-order response.
 *
 * @param {string} str
 */
function fletcher32(str) {
  let sum1 = 0xffff,
    sum2 = 0xffff;
  for (let i = 0; i < str.length; i++) {
    sum1 += str.charCodeAt(i);
    sum2 += sum1;
  }
  /* Second reduction step to reduce sums to 16 bits */
  sum1 = (sum1 & 0xffff) + (sum1 >>> 16);
  sum2 = (sum2 & 0xffff) + (sum2 >>> 16);
  return (sum2 << 16) | sum1;
}

/** @typedef {import("./message.js").PeerMessage} PeerMessage */
/** @typedef {import("./message.js").Diagnostic} Diagnostic */

/**
 * @typedef {import("./time-chunked-event-queue.js").TimeChunk<
 *   import("./message.js").SimulationMsg
 * >} SimChunk
 */

/**
 * @typedef {{
 *   sendEvent: (peerEvent: string) => void;
 *   getEvents: (time?: number) => SimChunk[] | null;
 *   getTickChunkMs: () => number;
 *   disconnect: () => void;
 *   sendDiagnostics: (diagnostics: Diagnostic[]) => void;
 * }} SimulationClient
 */

export class NetworkedGame {
  static debug = false;
  /**
   * @param {string} clientId
   * @param {Identity} identity
   * @param {SimulationClient} network
   * @param {() => void} stop
   * @param {Diagnostic[]} [diagnostics]
   * @param {number} [now]
   */
  constructor(
    clientId,
    identity,
    network,
    stop,
    diagnostics = [],
    now = performance.now()
  ) {
    this.clientId = clientId;
    this.identity = identity;
    this.network = network;
    this.stop = stop;
    this.isHost = network instanceof Server;
    /** @type {(() => () => void)[]} */
    this.watchers = [];
    this.lastUpdate = now;
    this.diagnostics = diagnostics;
  }

  /**
   * @template V
   * @param {() => V} get
   * @param {(prev: V, next: V) => void} onChange
   */
  addWatcher(get, onChange) {
    const watch = () => {
      const prevVal = get();
      return () => {
        const nextVal = get();
        if (prevVal !== nextVal) {
          onChange(prevVal, nextVal);
        }
      };
    };
    this.watchers.push(watch);
  }

  disconnect() {
    this.stop();
    this.network.disconnect();
  }

  /**
   * @template OE - Output events (often sent to the UI)
   * @param {NetworkedGameHandlers<OE>} handlers
   * @param {number} [now=performance.now()] Default is `performance.now()`
   */
  update(handlers, now = performance.now()) {
    /** @type {OE[]} */
    const outputEvents = [];
    let chunks = this.network.getEvents();
    if (!chunks) {
      return { disconnected: true, timeSinceLastUpdate: 0, outputEvents: [] };
    }
    if (chunks.length > 0) {
      const prevWatches = this.watchers.map((watch) => watch());
      for (let chunk of chunks) {
        for (let { msg, clientId, msgTime } of chunk.peerEvents) {
          if (NetworkedGame.debug) {
            if (msg.type === "peerJoined") {
              const stateHash = fletcher32(handlers.serialize());
              this.diagnostics.push({
                type: "stateHash",
                stateHash,
                updates: 0,
                msgTime,
                dt: chunk.dt,
              });
            }
            this.diagnostics.push({
              type: "peerMessage",
              peerMessage: msg,
              clientId,
              updates: 0,
              msgTime,
              dt: chunk.dt,
            });
          }
          switch (msg.type) {
            case "peerJoined":
              handlers.onPlayerJoined(clientId);
              break;
            case "peerLeft":
              handlers.onPlayerLeft(clientId);
              break;
            case "peerEvent":
              handlers.onEvent(clientId, msg.peerEvent);
              break;
            case "collectDiagnostics":
              const stateHash = fletcher32(handlers.serialize());
              this.diagnostics.push({
                type: "stateHash",
                stateHash,
                updates: 0,
                msgTime,
                dt: chunk.dt,
              });
              this.network.sendDiagnostics(this.diagnostics);
              break;
          }
        }
        if (NetworkedGame.debug) {
          this.diagnostics[this.diagnostics.length - 1].updates++;
        }
        const oe = handlers.update(chunk.dt / 1000);
        outputEvents.push(...oe);
      }
      prevWatches.forEach((watch) => watch());
      this.lastUpdate = now;
    } else {
      const timeSinceLastUpdate =
        Math.min(now - this.lastUpdate, this.network.getTickChunkMs()) / 1000;
      return { disconnected: false, timeSinceLastUpdate, outputEvents: [] };
    }
    return { disconnected: false, timeSinceLastUpdate: 0, outputEvents };
  }

  /**
   * @param {{ serialize: () => string }} getState
   * @param {Partial<ReturnType<Server.defaultOptions>>} [options]
   */
  static async hostGame(getState, options = {}) {
    const { server, clientId, identity } = await Server.init(
      getState.serialize(),
      options
    );

    /** @param {RTCDataChannel} channel */
    const onConnect = (channel) => {
      return server.onConnect(channel, () => ({
        state: getState.serialize(),
        diagnostics: networkedGame.diagnostics,
      }));
    };

    const networkedGame = new NetworkedGame(clientId, identity, server, stop);

    return {
      networkedGame,
      identity,
      onConnect,
    };
  }

  /**
   * @param {{ serialize: () => string }} getState
   * @param {Partial<ReturnType<Server.defaultOptions>>} [options]
   */
  static async singlePlayerGame(getState, options = {}) {
    const { server, clientId, identity } = await Server.init(
      getState.serialize(),
      options
    );
    const networkedGame = new NetworkedGame(
      clientId,
      identity,
      server,
      () => {}
    );
    return { networkedGame, identity };
  }

  /**
   * @template S
   * @param {RTCDataChannel} channel
   * @param {(s: string) => S | Promise<S>} deserialize
   * @param {Identity} [existingIdentity]
   */
  static async joinGame(channel, deserialize, existingIdentity = undefined) {
    const { client, clientId, identity, state, diagnostics } =
      await Client.init(channel, existingIdentity);
    const gameState = await deserialize(state);
    const networkedGame = new NetworkedGame(
      clientId,
      identity,
      client,
      () => {},
      diagnostics
    );
    return { networkedGame, identity, gameState };
  }

  /**
   * This function is used to test the game's behavior to ensure that it is
   * deterministic and that it can be played back from a given state. One could
   * also use this to record a game and play it back later.
   *
   * @template OE
   * @param {NetworkedGameHandlers<OE>} handlers
   * @param {Diagnostic[]} diagnostics
   * @returns {Generator<
   *   | { type: "stateHash"; stateHash: number; expectedHash: number }
   *   | { type: "update"; outputEvents: OE[] },
   *   void,
   *   void
   * >}
   */
  static *playbackDiagnostics(handlers, diagnostics) {
    for (const diag of diagnostics) {
      if (diag.type === "stateHash") {
        const stateHash = fletcher32(handlers.serialize());
        yield { type: "stateHash", stateHash, expectedHash: diag.stateHash };
      }
      if (diag.type === "peerMessage") {
        switch (diag.peerMessage.type) {
          case "peerJoined":
            handlers.onPlayerJoined(diag.clientId);
            break;
          case "peerLeft":
            handlers.onPlayerLeft(diag.clientId);
            break;
          case "peerEvent":
            handlers.onEvent(diag.clientId, diag.peerMessage.peerEvent);
            break;
        }
      }
      for (let i = 0; i < diag.updates; i++) {
        const outputEvents = handlers.update(diag.dt / 1000);
        yield { type: "update", outputEvents };
      }
    }
  }

  async collectDiagnostics() {
    if (this.isHost) {
      if (this.network instanceof Server) {
        return await this.network.collectDiagnostics();
      }
    }
    // This is a no-op for clients. We could collect the diagnostics from the
    // client, but clients don't know the initial state.
    return null;
  }

  /** @param {string} peerEvent */
  sendEvent(peerEvent) {
    this.network.sendEvent(peerEvent);
  }
}
