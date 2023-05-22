// @ts-check
import {
  assertDeepEq,
  assertEq,
  describe,
  it,
} from "../../test/test-helpers.js";
import { Client } from "./client.js";
import { Server } from "./server.js";
import { TimeChunkedEventQueue } from "./time-chunked-event-queue.js";

// test connection between client and server, and that the state gets sent to
// the client test that the client can send events to the server test that the
// server can send events to the client test multiple clients connecting to the
//   server, verify that the clients and server can send events to each other, and
//   the all get the same events in order

// test that the client can re-connect with the same identity. (need to actually have a way to specify the identity)

// split client and server into separate files, come up with a better name for TimeChunkedEventQueue

// need a nicer way to enable/disable logging

/**
 * @template E
 * @param {TimeChunkedEventQueue<E>} client
 * @param {number} t
 * @param {{
 *   simTime: number;
 *   dt: number;
 *   peerEvents: import("./time-chunked-event-queue.js").PeerMessage<E>[];
 * }[]} events
 */
async function expectExactEvents(client, t, events) {
  let clientEvents = client.getEvents(t);
  let waits = 0;
  while (clientEvents.length === 0) {
    if (waits > 100) {
      throw new Error("timed out waiting for events");
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
    clientEvents = client.getEvents(t);
    waits++;
  }
  assertEq(clientEvents.length, events.length);
  for (let i = 0; i < events.length; i++) {
    assertDeepEq(clientEvents[i], events[i]);
  }
}

describe("Server", function () {
  it("client should get the correct server state on connect", async function () {
    const { token, start } = await Server.init({
      getState: () => "foo",
    });

    const { server } = await start(0);

    server.stopTickTimer();

    const { state } = await Client.connect(token);

    assertEq(state, "foo");
  });
  it("should work", async function () {
    const { token, start } = await Server.init({
      getState: () => ({ x: 0, y: 0 }),
    });

    const { server } = await start(0);

    server.stopTickTimer();

    const { client, clientId, state, identity } = await Client.connect(token);

    console.log("client: ", client.clientId);

    const {
      client: client2,
      clientId: clientId2,
      state: state2,
    } = await Client.connect(token);

    client.sendEvent({ type: "move", x: 1, y: 1 });
    client2.sendEvent({ type: "move", x: 2, y: 2 });

    // client sends event, need to wait for server to get it
    // server sends event, I don't think we need to wait here?
    // on tick, don't need to wait as long as we've waited for client events to complete

    /** @type {ReturnType<(typeof server)["getEvents"]>} */
    const exactEvents = [
      {
        simTime: 10,
        dt: 10,
        peerEvents: [
          {
            type: "peerJoined",
            clientId: server.clientId,
            simTime: 0,
          },
          {
            type: "peerJoined",
            clientId: clientId,
            simTime: 0,
          },
          {
            type: "peerJoined",
            clientId: clientId2,
            simTime: 0,
          },
          {
            type: "peerEvent",
            clientId: clientId,
            simTime: 0,
            peerEvent: {
              type: "move",
              x: 1,
              y: 1,
            },
          },
          {
            type: "peerEvent",
            clientId: clientId2,
            simTime: 0,
            peerEvent: {
              type: "move",
              x: 2,
              y: 2,
            },
          },
        ],
      },
      {
        simTime: 20,
        dt: 10,
        peerEvents: [],
      },
      {
        simTime: 30,
        dt: 10,
        peerEvents: [],
      },
      {
        simTime: 40,
        dt: 10,
        peerEvents: [],
      },
      {
        simTime: 50,
        dt: 10,
        peerEvents: [],
      },
    ];

    await new Promise((resolve) => setTimeout(resolve, 10));

    server.onTick();

    await expectExactEvents(server, server.tickPeriodMs, exactEvents);

    console.log("sent events");

    // let javascript process events
    // Should I have a way to wait for the server to process events?

    // await new Promise((resolve) => setTimeout(resolve, 10));

    // server.onTick();
    // await new Promise((resolve) => setTimeout(resolve, 0));
    // server.onTick();
    // await new Promise((resolve) => setTimeout(resolve, 0));
    // server.onTick();
    // await new Promise((resolve) => setTimeout(resolve, 0));

    // client 1 should have received the move event from client 2
    // let events = client.getEvents(0);
    // await new Promise((resolve) => setTimeout(resolve, 0));
    // console.log("events1:", events);
    // server.onTick();
    // console.log("tick 1");
    // await new Promise((resolve) => setTimeout(resolve, 10));

    // let events = client.getEvents(server.tickPeriodMs);
    // console.log("events1:", events);

    // server.onTick();
    // console.log("tick 2");

    // await new Promise((resolve) => setTimeout(resolve, 0));

    // server.onTick();
    // await new Promise((resolve) => setTimeout(resolve, 0));
    // events = client.getEvents(server.tickPeriodMs);
    // console.log("events2:", events);
    // server.onTick();
    // await new Promise((resolve) => setTimeout(resolve, 0));

    // events = client.getEvents(server.tickPeriodMs * 2);
    // console.log("events3:", events);

    // await client.disconnect();
    // await client2.disconnect();

    stop();
  });
});
