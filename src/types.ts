/**
 * Type definitions for P2PCF React Native
 */

export interface P2PCFOptions {
  /**
   * URL of the Cloudflare Worker for signaling
   * @default 'https://p2pcf.minddrop.workers.dev'
   */
  workerUrl?: string;

  /**
   * STUN ICE servers configuration
   */
  stunIceServers?: any[];

  /**
   * TURN ICE servers configuration
   */
  turnIceServers?: any[];

  /**
   * RTCPeerConnection configuration options
   */
  rtcPeerConnectionOptions?: any;

  /**
   * Proprietary constraints for RTCPeerConnection
   */
  rtcPeerConnectionProprietaryConstraints?: any;

  /**
   * SDP transform function
   */
  sdpTransform?: (sdp: string) => string;

  /**
   * Network change polling interval in milliseconds
   * @default 15000
   */
  networkChangePollIntervalMs?: number;

  /**
   * State expiration interval in milliseconds
   * @default 120000 (2 minutes)
   */
  stateExpirationIntervalMs?: number;

  /**
   * State heartbeat window in milliseconds
   * @default 30000
   */
  stateHeartbeatWindowMs?: number;

  /**
   * Fast polling duration in milliseconds
   * @default 10000
   */
  fastPollingDurationMs?: number;

  /**
   * Fast polling rate in milliseconds
   * @default 1500
   */
  fastPollingRateMs?: number;

  /**
   * Slow polling rate in milliseconds
   * @default 5000
   */
  slowPollingRateMs?: number;

  /**
   * Idle polling trigger delay in milliseconds
   * @default Infinity
   */
  idlePollingAfterMs?: number;

  /**
   * Idle polling rate in milliseconds
   * @default Infinity
   */
  idlePollingRateMs?: number;
}

export interface Peer {
  /**
   * Unique session ID of the peer
   */
  id?: string;

  /**
   * Client ID of the peer
   */
  client_id?: string;

  /**
   * Whether the peer connection is established
   */
  connected: boolean;

  /**
   * Send data to the peer
   */
  send: (data: ArrayBuffer) => void;

  /**
   * Destroy the peer connection
   */
  destroy: () => void;
}

export interface P2PCFEvents {
  /**
   * Emitted when a peer connection is established
   */
  peerconnect: (peer: Peer) => void;

  /**
   * Emitted when a peer connection is closed
   */
  peerclose: (peer: Peer) => void;

  /**
   * Emitted when a message is received from a peer
   */
  msg: (peer: Peer, data: ArrayBuffer) => void;

  /**
   * Emitted when an error occurs
   */
  error: (error: Error) => void;
}

export type P2PCFEventType = keyof P2PCFEvents;
