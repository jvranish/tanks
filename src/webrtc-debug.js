/* eslint-disable prefer-destructuring */
/* eslint-disable no-console */

/**
 * @param { string } name
 * @param { RTCPeerConnection } connection
 */
const enableConnectionLogs = (name, connection) => {
  connection.addEventListener('iceconnectionstatechange', (ev) => {
    const target = /** @type {RTCPeerConnection} */ (ev.target);
    console.log(
      'Ice Connection State Change: ',
      name,
      ', gathering state: ',
      target.iceGatheringState,
      ', connection state: ',
      target.iceConnectionState,
    );
  });

  connection.addEventListener('icegatheringstatechange', (ev) => {
    const target = /** @type {RTCPeerConnection} */ (ev.target);
    console.log(
      'Ice Gathering State Change: ',
      name,
      ', gathering state: ',
      target.iceGatheringState,
      ', connection state: ',
      target.iceConnectionState,
    );
  });
};

export default enableConnectionLogs;
