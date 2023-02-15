// @ts-check
import { assertEq, barrierMsg } from "./test-helpers.js";
import { startOffer, answerOffer } from "./webrtc.js";

export const webRTCTestAnswerIceFail = async () => {
  const {offer} = await startOffer({ name: "a" });
  const { waitForConnect} = await answerOffer(offer, { name: "b" });
  await waitForConnect();
};

export const webRTCTestOfferTimeout = async () => {
  const {offer, acceptAnswer} = await startOffer({ name: "a" });

  const connection = new RTCPeerConnection();
  connection.setRemoteDescription(offer);
  const answerInit = await connection.createAnswer();
  await connection.setLocalDescription(answerInit);
  const answer = /** @type {RTCSessionDescription} */ (
    connection.localDescription
  );

  // Close answering peer to cause a timeout
  connection.close();

  // This should time out
  await acceptAnswer(answer);
  // const socketB = await waitForConnect();

  // await socketA.send("asdf");
  // const msg = await socketB.recv();
  // console.log("recv: ", msg);
};


export const webRTCTest = async () => {
  const { send: sendOffer, recv: recvOffer } = barrierMsg();
  const { send: sendAnswer, recv: recvAnswer } = barrierMsg();

  const a = async () => {
    const {offer, acceptAnswer} = await startOffer({ name: "a" });
    await sendOffer(offer);
    const answer = await recvAnswer();
    const socket = await acceptAnswer(answer);
    await socket.send("ping");
    const msg = await socket.recv();

    assertEq(msg, "pong");

    socket.close();
  };

  const b = async () => {
    const offer = await recvOffer();
    const {answer, waitForConnect} = await answerOffer(offer, { name: "b" });
    await sendAnswer(answer);
    const socket = await waitForConnect();
    const msg = await socket.recv();

    assertEq(msg, "ping");

    await socket.send("pong");

    socket.close();
  };

  return Promise.all([a(), b()]);
};
