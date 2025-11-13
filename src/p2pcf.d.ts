import { EventEmitter } from 'events';
import type { P2PCFOptions, P2PCFEvents, P2PCFEventType, Peer as P2PCFPeer } from './types';

/**
 * Main P2PCF class for managing peer-to-peer WebRTC data connections
 * using a Cloudflare Worker as the signaling server.
 *
 * This is a typed declaration for the runtime implementation in
 * [`src/p2pcf.js`](src/p2pcf.js:1).
 */
export default class P2PCF extends EventEmitter {
  /**
   * All active peers in the current room, keyed by their session ID.
   */
  peers: Map<string, P2PCFPeer>;

  /**
   * IDs of currently connected peer sessions.
   */
  connectedSessions: string[];

  /**
   * Unique client identifier for this instance.
   */
  clientId: string;

  /**
   * Room identifier used for peer discovery.
   */
  roomId: string;

  /**
   * Unique session identifier for this instance.
   */
  sessionId: string;

  /**
   * Create a new P2PCF instance.
   *
   * @param clientId - Unique ID for this client (min length: 4)
   * @param roomId - Room identifier used to discover peers (min length: 4)
   * @param options - Optional configuration
   */
  constructor(clientId: string, roomId: string, options?: P2PCFOptions);

  /**
   * Connect to the signaling worker and start discovering peers.
   *
   * Must be called before peers can connect.
   */
  start(): Promise<void>;

  /**
   * Send a binary message to a specific peer.
   *
   * Messages larger than the internal max size are automatically chunked.
   *
   * @param peer - Target peer
   * @param msg - Message as ArrayBuffer or Uint8Array
   */
  send(peer: P2PCFPeer, msg: ArrayBuffer | Uint8Array): void;

  /**
   * Broadcast a binary message to all connected peers.
   *
   * @param msg - Message as ArrayBuffer or Uint8Array
   */
  broadcast(msg: ArrayBuffer | Uint8Array): void;

  /**
   * Gracefully tear down all timers, connections and peers for this instance.
   *
   * In React Native / non-browser environments, this should be called explicitly.
   */
  destroy(): void;

  /**
   * Register a typed event handler.
   */
  on<K extends P2PCFEventType>(event: K, listener: P2PCFEvents[K]): this;
  on(event: string, listener: (...args: any[]) => void): this;

  /**
   * Register a one-time typed event handler.
   */
  once<K extends P2PCFEventType>(event: K, listener: P2PCFEvents[K]): this;
  once(event: string, listener: (...args: any[]) => void): this;

  /**
   * Remove a typed event handler.
   */
  off<K extends P2PCFEventType>(event: K, listener: P2PCFEvents[K]): this;
  off(event: string, listener: (...args: any[]) => void): this;

  /**
   * Emit a typed event. (Primarily for internal usage.)
   */
  emit<K extends P2PCFEventType>(event: K, ...args: Parameters<P2PCFEvents[K]>): boolean;
  emit(event: string, ...args: any[]): boolean;
}