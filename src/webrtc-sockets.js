import { Queue } from "./queue.js";
import { WaitingList } from "./signaling-services/waiting-list.js";
import * as OneshotExchange from "./signaling-services/oneshot-exchange.js";
import { startOffer, answerOffer, Channel } from "./webrtc.js";
import { EncryptedStoreFactory } from "./signaling-services/encrypted-store-factory.js";
import { randomString, wait } from "./signaling-services/util.js";

/*

The overall architecture is as follows: There is one server and any number of
clients. When the client wants to perform an action, rather than immediately
taking the action, it sends an event to the server, the server will timestamp
the event and send it to all connected clients. The clients then only process
events that they have received them from the server.

```
sequenceDiagram
    client1->>server: Sends event
    note over server: timestamp event
    server->>client1: Returns event
    server->>client2: Sends event
    server->>client3: Sends event
```

This way as long as all clients start with the same state, they can process all
the same events, all in the same order and all of their states should stay in
sync. Simple right?



However, there are some additional complications if we want this "simultaneous
simulation" to progress in real-time (which we usually do), _especially_ if it's
something like a video game where we need the simulation to progress smoothly
without any stuttering.


One might think we could just process events as we receive them from the server,
and this would work if the events were truly the only input to the simulation,
but often there is an implicit input of time.

To make this more concrete, lets say this simulation is a video game. In this
video game we fired a missile at an opponent player. As a client we've sent an
event that we've fired a missile, and the server has relayed that event to all
clients so they all know to draw the missile on the screen, etc..

However, in order to draw progress (and especially to do it smoothly) of missile
zooming towards its target, we need to continually update the position of the
missile, and we will need to do it even if there are no new incoming player
events. Additionally, when you're animating something like this, you don't have
control how fast time progresses, you have to render frames at consistent
intervals to make the animation smooth. if you are using this for games, you'll
likely use javascript's `requestAnimationFrame()` to know when to render the
next frame, which means you get _told_ what time it really is and you'll have to
run the simulation forward to the appropriate point.


- In order for the simulation/animations/etc to progress smoothly, the
  progression of time (at least from the perspective of that particular client)
  has to be controlled _by that client_.

So because we cannot process events immediately, each client is going to have an
incoming queue of events it has received from the server.

And in my particular API, clients can pull events from the queue in chunks based
on a certain amount of time. The size of these "chunks" must be fixed and agreed
upon by all clients. (One could conceivably use variable sized chunks but you'd
need some way to coordinate the sizes with the other clients, which would be a
real pain)

`getEvents()`


However there is an additional problem. If there haven't been any new events in
a while, and the incoming event queue is empty, how do we know that there
haven't been any new events in the next "chunk" of simulation time? The answer
is: we can't! To solve this problem we have the server send out a "tick"
(also timestamped) on a set interval. This way when we see a tick we can know
that we're not waiting for any new events and can run the simulation up to the
timestamp on the tick.


Additionally, in order to prevent "stuttering" we actually _can't_ process any events we've gotten since the last tick, until we get the _next_ tick.
Consider the scenario with the missile again, let say the opponent has a shield, 







As a client we've sent an event to put a fish in the oven, the server relayed
that event to all clients, so we all know that there is now a fish in the oven,
but at some point (say 5 seconds in the future) that fish is going to be "done"
and we're likely going to want to show cooking progress animations and a
transition to the "done" state without any other client initiated events
occurring.






Lets say this simulation is a video game, and we want to process events once a
frame ()


Are there two tick rates?
- There's how often the tick message is sent, this allows time to progress
  without user inputs
  - also it's how much needs to be buffered (i.e. delayed) to prevent stuttering
- there is the unit of time chunking you want to process incoming events in
  (everyone needs to agree which )

perhaps externally poll for new events? need to always increment the same amount
of time as everyone else...


connect(token) (get state, and tick rate, wait for our join event?)
onTick(events?) onJoin onLeft onEvent

// getState // connected(current stateData, tickRate, current simulation time)
// event(data) // tick // joined(clientId) // left(clientId)


*/
// TODO process events with an interval timer instead of on frame?

// TODO add a sendObj to Channel?

// TODO add queue for events, and a chunking method
// TODO how to handle errors?
// joined/left events need to be grouped up with other peer events
// need onTick processing for Client  (and getEvents for Server  (onTick won't be a callback anymore))
// better name for peerMessage?
//

/**
 * @template E
 * @typedef {| { type: "peerJoined"; clientId: string; simTime: number }
 *   | { type: "peerLeft"; clientId: string; simTime: number }
 *   | { type: "disconnected"; simTime: number }
 *   | {
 *       type: "peerEvent";
 *       clientId: string;
 *       simTime: number;
 *       peerEvent: E;
 *     }} PeerMessage
 */

/**
 * @template S, E
 * @typedef {| { type: "tick"; simTime: number }
 *   | {
 *       type: "connected";
 *       clientId: string;
 *       simTime: number;
 *       tickPeriodMs: number;
 *       timeChunkMs: number;
 *       state: S;
 *     }
 *   | { type: "peerMessage"; msg: PeerMessage<E> }} Message
 */

// TODO come up with a better name for this
/** @template E */
export class EventChunker {
  /**
   * @param {{
   *   simTime: number;
   *   tickPeriodMs: number;
   *   timeChunkMs: number;
   * }} init
   */
  constructor({ simTime, tickPeriodMs, timeChunkMs }) {
    this.simTime = simTime;
    this.localTime = simTime;
    this.deltaReference = performance.now();
    this.tickPeriodMs = tickPeriodMs;
    this.timeChunkMs = timeChunkMs;
    /**
     * @type {{
     *   simTime: number;
     *   dt: number;
     *   peerEvents: PeerMessage<E>[];
     * }[]}
     */
    this.eventChunkQueue = [];
    /** @type {PeerMessage<E>[]} */
    this.msgQueue = [];

    /** @type {null | ReturnType<setInterval>} */
    this.chunkTimer = null;
  }

  /**
   * @param {(chunk: {
   *   dt: number;
   *   peerEvents: PeerMessage<E>[];
   *   simTime: number;
   * }) => void} onChunk
   */
  startProcessingEvents(onChunk) {
    this.onChunk = onChunk;
    this.chunkTimer = setInterval(() => {
      const time = performance.now();
      const dt = time - this.deltaReference;
      this.deltaReference = time;
      for (const chunk of this.getEvents(dt)) {
        onChunk(chunk);
        if (
          this.chunkTimer &&
          chunk.peerEvents.some((msg) => msg.type === "disconnected")
        ) {
          clearInterval(this.chunkTimer);
        }
      }
    }, this.timeChunkMs);
  }

  /** @param {E} peerEvent */
  sendEvent(peerEvent) {}

  /** @param {number} simTime */
  processTick(simTime) {
    // Local simTime is always incremented timeChunkMs at a time.
    let t = this.simTime + this.timeChunkMs;
    // Local simTime is always <= the simTime from the last tick. If there is
    // some time (and events) still left to process, we will leave them in the
    // queue and process them in the next tick.
    for (; t <= simTime; t += this.timeChunkMs) {
      const peerEvents = shiftWhile(this.msgQueue, (msg) => msg.simTime <= t);
      // We use the time at the _end_ of the chunk, rather than the beginning.
      this.eventChunkQueue.push({
        simTime: t,
        dt: this.timeChunkMs,
        peerEvents,
      });
      this.simTime = t;
    }
  }

  /** @param {PeerMessage<E>} msg */
  recvMsg(msg) {
    this.msgQueue.push(msg);
  }

  /** @param {number} dt */
  getEvents(dt) {
    const fullQueueSize = this.tickPeriodMs / this.timeChunkMs;
    // if we're too far behind, advance time to the next chunk immediately
    const maxChunksBehind = 3;
    if (this.eventChunkQueue.length > fullQueueSize + maxChunksBehind) {
      /**
       * @type {{
       *   simTime: number;
       *   dt: number;
       *   peerEvents: PeerMessage<E>[];
       * }[]}
       */
      const chunks = [];
      while (this.eventChunkQueue.length > fullQueueSize) {
        const event = this.eventChunkQueue.shift();
        if (event) {
          this.localTime = event.simTime;
          chunks.push(event);
        }
      }
      return chunks;
    }

    if (this.eventChunkQueue.length > 0) {
      /**
       * @type {{
       *   simTime: number;
       *   dt: number;
       *   peerEvents: PeerMessage<E>[];
       * }[]}
       */
      let chunks = [];
      // Don't advance time if we have no chunks in the queue (we should normally
      // have _some_ chunks even if they are empty, and if not, we need to slow
      // down time)
      this.localTime += dt;
      while (
        this.eventChunkQueue.length > 0 &&
        this.localTime >= this.eventChunkQueue[0].simTime
      ) {
        const chunk = this.eventChunkQueue.shift();
        if (chunk) {
          chunks.push(chunk);
        }
      }
      if (chunks.length > 5) {
        console.log("chunks", chunks.length);
        console.log("dt", dt);
      }
      return chunks;
    }
    return [];
  }
}

/**
 * @template E
 * @extends EventChunker<E>
 */
export class Client extends EventChunker {
  /**
   * @param {{
   *   channel: Channel;
   *   clientId: string;
   *   simTime: number;
   *   tickPeriodMs: number;
   *   timeChunkMs: number;
   * }} init
   */
  constructor({
    channel,
    clientId,
    simTime,
    tickPeriodMs,
    timeChunkMs,
  }) {
    super({ simTime, tickPeriodMs, timeChunkMs});
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
   * @returns {Promise<{ client: Client<E>; clientId: string; state: S }>}
   */
  static async connect(token) {
    const channel = await connect(token);
    const connectMsg = await new Promise((r) => (channel.onData = r));
    let { clientId, simTime, tickPeriodMs, timeChunkMs, state } =
      JSON.parse(connectMsg);

    const client = new Client({
      channel,
      clientId,
      simTime,
      tickPeriodMs,
      timeChunkMs,
    });

    channel.onData = (data) => {
      if (data === null) {
        client.recvMsg({ type: "disconnected", simTime: client.simTime });
      } else {
        /** @type {Message<S, E>} */
        const msg = JSON.parse(data);
        if (msg.type === "peerMessage") {
          client.recvMsg(msg.msg);
        } else if (msg.type === "tick") {
          client.processTick(msg.simTime);
        } else {
          throw new Error(`Unexpected message type: ${msg.type}`);
        }
      }
    };
    return { client, clientId, state };
  }
}

/**
 * @template S, E
 * @typedef {Object} ServerCallbacks
 * @property {function(void): S} getState
 */

/**
 * @template T
 * @param {T[]} arr
 * @param {(x: T) => boolean} predicate
 * @returns {T[]}
 */
function shiftWhile(arr, predicate) {
  let removedElements = [];
  while (arr.length > 0 && predicate(arr[0])) {
    // The shift can't fail as we've just checked for a non-zero array length
    removedElements.push(/** @type {T} */ (arr.shift()));
  }
  return removedElements;
}

/**
 * @template S, E
 * @extends EventChunker<E>
 */
export class Server extends EventChunker {
  /**
   * @memberof Server
   * @param {string} token
   * @param {() => void} stop
   * @param {ServerCallbacks<S, E>} callbacks
   */
  constructor(token, stop, callbacks) {
    super({
      simTime: 0,
      tickPeriodMs: 50,
      timeChunkMs: 10,
    });
    /** @type {{ [key: string]: Channel }} */
    this.clients = {};
    this.token = token;
    this.stop = stop;
    this.callbacks = callbacks;
    this.clientId = randomString(12);
    this.tickTimer = setInterval(() => {
      const nextTickTime = this.simTime + this.tickPeriodMs;
      this.broadcast({ type: "tick", simTime: nextTickTime });
      this.processTick(nextTickTime);
    }, this.tickPeriodMs);
  }
  /**
   * This is use for sending both client events and server events
   *
   * @param {E} peerEvent
   */
  sendEvent(peerEvent) {
    this.sendClientEvent(this.clientId, peerEvent);
  }

  /**
   * @param {string} clientId
   * @param {E} peerEvent
   */
  sendClientEvent(clientId, peerEvent) {
    /** @type {PeerMessage<E>} */
    const msg = {
      type: "peerEvent",
      clientId: clientId,
      simTime: this.simTime,
      peerEvent,
    };
    this.broadcast({
      type: "peerMessage",
      msg,
    });
  }
  /** @param {Message<S, E>} msg */
  broadcast(msg) {
    // TODO note this doesn't send to the message to ourselves!
    const data = JSON.stringify(msg);
    for (let clientId of Object.keys(this.clients)) {
      this.clients[clientId].send(data);
    }
    if (msg.type === "peerMessage") {
      this.recvMsg(msg.msg);
    }
  }
  /** @param {Channel} channel */
  onConnect(channel) {
    let clientId = randomString(12);
    this.clients[clientId] = channel;
    channel.onData = (msg) => {
      if (msg === null) {
        console.log("client disconnected", clientId);
        this.onDisconnect(clientId);
      } else {
        // TODO handle parse failure here (and other places)
        const peerEvent = JSON.parse(msg);
        this.sendClientEvent(clientId, peerEvent);
      }
    };
    let state = this.callbacks.getState();
    channel.send(
      JSON.stringify({
        type: "connected",
        clientId,
        simTime: this.simTime,
        tickPeriodMs: this.tickPeriodMs,
        timeChunkMs: this.timeChunkMs,
        state,
      })
    );
    this.broadcast({
      type: "peerMessage",
      msg: {
        type: "peerJoined",
        clientId,
        simTime: this.simTime,
      },
    });
  }

  /** @param {string} clientId */
  onDisconnect(clientId) {
    this.clients[clientId].close();
    delete this.clients[clientId];

    this.broadcast({
      type: "peerMessage",
      msg: {
        type: "peerLeft",
        clientId,
        simTime: this.simTime,
      },
    });
  }
  getToken() {
    return this.token;
  }
  /**
   * @template S, E
   * @param {ServerCallbacks<S, E>} serverCallbacks
   */
  static async init(serverCallbacks) {
    let { token, start: startListen } = await listen();

    const start = async () => {
      /** @param {Channel} channel */
      const onConnect = (channel) => {
        server.onConnect(channel);
      };
      let { stop } = await startListen({ onConnect });
      let server = new Server(token, stop, serverCallbacks);
      /** @type {PeerMessage<E>} */
      const joinMsg = {
        type: "peerJoined",
        clientId: server.clientId,
        simTime: server.simTime,
      };
      server.recvMsg(joinMsg);
      // server.sendEvent(joinMsg);
      return { token, server };
    };
    return { token, start };
  }
}

/** @param {string} token */
export async function accept(token) {
  let { msg, sendResponse } = await OneshotExchange.fromToken(token);
  let offer = msg;
  const { answer, waitForConnect } = await answerOffer(offer, {
    name: "host",
  });
  await sendResponse(answer);
  let channel = await waitForConnect();
  return channel;
}

/** @param {EncryptedStoreFactory} [factory] */
export async function listen(factory) {
  if (!factory) {
    factory = await EncryptedStoreFactory.newFactory();
  }

  const waitingList = await WaitingList.start(factory);
  const token = await waitingList.toToken();

  /**
   * @param {{
   *   onConnect: (channel: Channel) => void;
   *   onError?: (token: string, error: any) => void;
   *   checkPeriod?: number;
   * }} callbacks
   */
  const start = async ({
    onConnect,
    onError = (/** @type {string} */ token, /** @type {any} */ err) =>
      console.error("Error connecting client", token, err),
    checkPeriod = 1000, // 1 second
  }) => {
    /** @type {ReturnType<setTimeout> | undefined} */
    let timerId = undefined;

    let checkForConnections = async () => {
      let waitingConnection = await waitingList.take();

      for (let waitingToken of waitingConnection) {
        accept(waitingToken)
          .then(onConnect)
          .catch((error) => onError(waitingToken, error));
      }
      timerId = setTimeout(checkForConnections, checkPeriod);
    };

    setTimeout(checkForConnections, checkPeriod);

    return {
      token,
      stop: () => clearTimeout(timerId),
    };
  };
  return { token, start };
}

/** @param {string} token */
async function connect(token) {
  const waitingList = await WaitingList.fromToken(token);
  const { offer, acceptAnswer } = await startOffer();
  const { token: internalToken, waitForResponse } =
    await OneshotExchange.startWithStore(offer, waitingList.store);
  await waitingList.put(internalToken);

  const answer = await waitForResponse();

  const channel = await acceptAnswer(answer);
  return channel;
}
/**
 * @param {number} [timeout]
 * @param {EncryptedStoreFactory} [factory]
 */
async function connectDirect(timeout, factory) {
  if (!factory) {
    factory = await EncryptedStoreFactory.newFactory();
  }
  const { offer, acceptAnswer } = await startOffer();
  const { token, waitForResponse } = await OneshotExchange.start(
    offer,
    timeout,
    factory
  );

  const waitForConnect = async () => {
    const answer = await waitForResponse();

    const channel = await acceptAnswer(answer);
    return channel;
  };
  return { token, waitForConnect };
}
