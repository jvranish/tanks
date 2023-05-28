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


Additionally, in order to prevent "stuttering" we actually _can't_ process any events
 we've gotten since the last tick, until we get the _next_ tick.
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
 *   | { type: "identity"; identity: { publicKey: string } }
 *   | { type: "challenge"; challenge: string }
 *   | { type: "signature"; signature: string }
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


// TODO come up with a better name for this
/** @template E */
export class TimeChunkedEventQueue {
  /**
   * @param {{
   *   simTime: number;
   *   tickPeriodMs: number;
   *   timeChunkMs: number;
   *   now: number;
   * }} init
   */
  constructor({ simTime, tickPeriodMs, timeChunkMs, now }) {
    this.simTime = simTime;
    this.localTime = simTime;
    this.deltaReference = now;
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

  /** @param {E} peerEvent */
  sendEvent(peerEvent) {}


  // TODO pull process tick into part of recvMsg
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

  getEvents(time = performance.now()) {
    const dt = time - this.deltaReference;
    this.deltaReference = time;
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
 * @template S, E
 * @template {Message<S, E>["type"]} T
 * @param {Omit<Extract<Message<S, E>, { type: T }>, "type">} msg
 * @param {RTCDataChannel} channel
 * @param {T} msgType
 */
export async function channelSend(channel, msg, msgType) {
  channel.send(JSON.stringify({ type: msgType, ...msg }));
}

/**
 * @template S, E
 * @template {Message<S, E>["type"]} T
 * @param {RTCDataChannel} channel
 * @param {T} msgType
 * @returns {Promise<Extract<Message<S, E>, { type: T }>>}
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
