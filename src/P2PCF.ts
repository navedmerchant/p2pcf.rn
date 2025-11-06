/**
 * Peer 2 Peer WebRTC connections with Cloudflare Workers as signalling server
 * Adapted for React Native
 * Original Copyright Greg Fodor <gfodor@gmail.com>
 * Licensed under MIT
 */

import { EventEmitter } from 'events';
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
} from 'react-native-webrtc';
import {
  encode as arrayBufferToBase64,
  decode as base64ToArrayBuffer,
} from 'base64-arraybuffer';
import { hexToBytes } from 'convert-hex';
import arrayBufferToHex from 'array-buffer-to-hex';

const CONNECT_TIMEOUT = 15000;
const MAX_MESSAGE_LENGTH_BYTES = 16000;
const TRICKLE_ICE_TIMEOUT = 3000;
const CHUNK_HEADER_LENGTH_BYTES = 12;
const CHUNK_MAGIC_WORD = 8121;
const CHUNK_MAX_LENGTH_BYTES =
  MAX_MESSAGE_LENGTH_BYTES - CHUNK_HEADER_LENGTH_BYTES;
const SIGNAL_MESSAGE_HEADER_WORDS = [0x82ab, 0x81cd, 0x1295, 0xa1cb];

const CANDIDATE_TYPES: Record<string, number> = {
  host: 0,
  srflx: 1,
  relay: 2,
};

const CANDIDATE_TCP_TYPES: Record<string, number> = {
  active: 0,
  passive: 1,
  so: 2,
};

const CANDIDATE_IDX = {
  TYPE: 0,
  PROTOCOL: 1,
  IP: 2,
  PORT: 3,
  RELATED_IP: 4,
  RELATED_PORT: 5,
  TCP_TYPE: 6,
};

const DEFAULT_STUN_ICE = [
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

const DEFAULT_TURN_ICE = [
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

// React Native crypto polyfill
const getRandomValues = (array: Uint8Array): Uint8Array => {
  for (let i = 0; i < array.length; i++) {
    array[i] = Math.floor(Math.random() * 256);
  }
  return array;
};

const randomstring = (len: number): string => {
  const bytes = getRandomValues(new Uint8Array(len));
  const str = Array.from(bytes)
    .map((v) => String.fromCharCode(v))
    .join('');
  return btoa(str).replace(/[=]/g, '');
};

const textDecoder = new TextDecoder('utf-8');
const textEncoder = new TextEncoder();

const arrToText = (arr: Uint8Array): string => textDecoder.decode(arr);
const textToArr = (text: string): Uint8Array => textEncoder.encode(text);

const removeInPlace = <T>(
  a: T[],
  condition: (val: T, i: number, arr: T[]) => boolean
): T[] => {
  let i = 0,
    j = 0;

  while (i < a.length) {
    const val = a[i]!;
    if (!condition(val, i, a)) a[j++] = val;
    i++;
  }

  a.length = j;
  return a;
};

const hexToBase64 = (hex: string): string =>
  arrayBufferToBase64(hexToBytes(hex).buffer as ArrayBuffer);
const base64ToHex = (b64: string): string =>
  arrayBufferToHex(base64ToArrayBuffer(b64));

function createSdp(
  isOffer: boolean,
  iceUFrag: string,
  icePwd: string,
  dtlsFingerprintBase64: string
): string {
  const dtlsHex = base64ToHex(dtlsFingerprintBase64);
  let dtlsFingerprint = '';

  for (let i = 0; i < dtlsHex.length; i += 2) {
    dtlsFingerprint += `${dtlsHex[i]}${dtlsHex[i + 1]}${
      i === dtlsHex.length - 2 ? '' : ':'
    }`.toUpperCase();
  }

  const sdp = [
    'v=0',
    'o=- 5498186869896684180 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    'a=mid:0',
    'a=sctp-port:5000',
  ];

  if (isOffer) {
    sdp.push('a=setup:actpass');
  } else {
    sdp.push('a=setup:active');
  }

  sdp.push(`a=ice-ufrag:${iceUFrag}`);
  sdp.push(`a=ice-pwd:${icePwd}`);
  sdp.push(`a=fingerprint:sha-256 ${dtlsFingerprint}`);

  return sdp.join('\r\n') + '\r\n';
}

const parseCandidate = (line: string): (number | string | null)[] => {
  let parts: string[];

  if (line.indexOf('a=candidate:') === 0) {
    parts = line.substring(12).split(' ');
  } else {
    parts = line.substring(10).split(' ');
  }

  const candidate: (number | string | null)[] = [
    CANDIDATE_TYPES[parts[7]!] ?? 0,
    parts[2]!.toLowerCase() === 'udp' ? 0 : 1,
    parts[4]!,
    parseInt(parts[5]!, 10),
  ];

  for (let i = 8; i < parts.length; i += 2) {
    switch (parts[i]) {
      case 'raddr':
        while (candidate.length < 5) candidate.push(null);
        candidate[4] = parts[i + 1]!;
        break;
      case 'rport':
        while (candidate.length < 6) candidate.push(null);
        candidate[5] = parseInt(parts[i + 1]!, 10);
        break;
      case 'tcptype':
        while (candidate.length < 7) candidate.push(null);
        candidate[6] = CANDIDATE_TCP_TYPES[parts[i + 1]!] ?? null;
        break;
      default:
        break;
    }
  }

  while (candidate.length < 8) candidate.push(null);
  candidate[7] = parseInt(parts[3]!, 10);

  return candidate;
};

interface SimplePeer extends EventEmitter {
  id?: string;
  client_id?: string;
  connected: boolean;
  _pc: RTCPeerConnection;
  _iceComplete?: boolean;
  _pendingRemoteSdp?: string;
  signal: (data: any) => void;
  send: (data: ArrayBuffer) => void;
  destroy: () => void;
}

class SimplePeerImplementation extends EventEmitter implements SimplePeer {
  id?: string;
  client_id?: string;
  connected = false;
  _pc: RTCPeerConnection;
  _iceComplete = false;
  _pendingRemoteSdp?: string;
  private _channel: any;
  private _dataChannelReady = false;

  constructor(options: any) {
    super();
    this._pc = new RTCPeerConnection(options.config);

    (this._pc as any).onicecandidate = (event: any) => {
      if (event.candidate) {
        this.emit('signal', { candidate: event.candidate });
      } else {
        this.emit('signal', { candidate: null });
      }
    };

    (this._pc as any).onconnectionstatechange = () => {
      if (
        this._pc.connectionState === 'connected' ||
        this._pc.connectionState === 'failed' ||
        this._pc.connectionState === 'closed'
      ) {
        if (this._pc.connectionState === 'connected') {
          this.connected = true;
          this.emit('connect');
        } else {
          this.emit('close');
        }
      }
    };

    if (options.initiator) {
      this._channel = this._pc.createDataChannel('datachannel');
      this._setupDataChannel();

      this._pc
        .createOffer()
        .then((offer: any) => {
          let sdp = offer.sdp;
          if (options.sdpTransform) {
            sdp = options.sdpTransform(sdp);
          }
          return this._pc.setLocalDescription(
            new RTCSessionDescription({ type: 'offer', sdp })
          );
        })
        .then(() => {
          this.emit('signal', {
            type: 'offer',
            sdp: this._pc.localDescription?.sdp,
          });
        })
        .catch((err: Error) => this.emit('error', err));
    } else {
      (this._pc as any).ondatachannel = (event: any) => {
        this._channel = event.channel;
        this._setupDataChannel();
      };
    }
  }

  private _setupDataChannel() {
    this._channel.onopen = () => {
      this._dataChannelReady = true;
      this.connected = true;
      this.emit('connect');
    };

    this._channel.onmessage = (event: any) => {
      this.emit('data', event.data);
    };

    this._channel.onerror = (err: Error) => {
      this.emit('error', err);
    };

    this._channel.onclose = () => {
      this.emit('close');
    };
  }

  signal(data: any) {
    if (data.type === 'offer') {
      this._pc
        .setRemoteDescription(new RTCSessionDescription(data))
        .then(() => this._pc.createAnswer())
        .then((answer: any) => {
          return this._pc.setLocalDescription(
            new RTCSessionDescription(answer)
          );
        })
        .then(() => {
          this.emit('signal', {
            type: 'answer',
            sdp: this._pc.localDescription?.sdp,
          });
        })
        .catch((err: Error) => this.emit('error', err));
    } else if (data.type === 'answer') {
      this._pc
        .setRemoteDescription(new RTCSessionDescription(data))
        .catch((err: Error) => this.emit('error', err));
    } else if (data.candidate) {
      this._pc
        .addIceCandidate(new RTCIceCandidate(data.candidate))
        .catch((err: Error) => this.emit('error', err));
    }
  }

  send(data: ArrayBuffer) {
    if (this._dataChannelReady && this._channel) {
      this._channel.send(data);
    }
  }

  destroy() {
    if (this._channel) {
      this._channel.close();
    }
    this._pc.close();
    this.removeAllListeners();
  }
}

export interface P2PCFOptions {
  workerUrl?: string;
  stunIceServers?: any[];
  turnIceServers?: any[];
  rtcPeerConnectionOptions?: any;
  rtcPeerConnectionProprietaryConstraints?: any;
  sdpTransform?: (sdp: string) => string;
  networkChangePollIntervalMs?: number;
  stateExpirationIntervalMs?: number;
  stateHeartbeatWindowMs?: number;
  fastPollingDurationMs?: number;
  fastPollingRateMs?: number;
  slowPollingRateMs?: number;
  idlePollingAfterMs?: number;
  idlePollingRateMs?: number;
}

export default class P2PCF extends EventEmitter {
  public peers: Map<string, SimplePeer>;
  public connectedSessions: string[];
  public readonly clientId: string;
  public readonly roomId: string;
  public readonly sessionId: string;
  public readonly contextId: string;

  private msgChunks: Map<number, Uint8Array>;
  private packages: any[];
  private dataTimestamp: number | null;
  private lastPackages: string | null;
  private lastProcessedReceivedDataTimestamps: Map<string, number>;
  private packageReceivedFromPeers: Set<string>;
  private startedAtTimestamp: number | null;
  private peerOptions: any;
  private peerSdpTransform: (sdp: string) => string;
  private workerUrl: string;
  private stunIceServers: any[];
  private turnIceServers: any[];
  private networkChangePollIntervalMs: number;
  private stateExpirationIntervalMs: number;
  private stateHeartbeatWindowMs: number;
  private fastPollingDurationMs: number;
  private fastPollingRateMs: number;
  private slowPollingRateMs: number;
  private idlePollingAfterMs: number;
  private idlePollingRateMs: number;
  private udpEnabled: boolean | null;
  private isSymmetric: boolean | null;
  private dtlsFingerprint: string | null;
  private reflexiveIps: Set<string>;
  private isSending: boolean;
  private finished: boolean;
  private nextStepTime: number;
  private deleteKey: string | null;
  private sentFirstPoll: boolean;
  private stopFastPollingAt: number;
  private startIdlePollingAt: number;
  private networkSettingsInterval: any;
  private stepInterval: any;

  constructor(clientId = '', roomId = '', options: P2PCFOptions = {}) {
    super();

    if (!clientId || clientId.length < 4) {
      throw new Error('Client ID must be at least four characters');
    }

    if (!roomId || roomId.length < 4) {
      throw new Error('Room ID must be at least four characters');
    }

    const now = Date.now();

    this.peers = new Map();
    this.msgChunks = new Map();
    this.connectedSessions = [];
    this.clientId = clientId;
    this.roomId = roomId;
    this.sessionId = randomstring(20);
    this.packages = [];
    this.dataTimestamp = null;
    this.lastPackages = null;
    this.lastProcessedReceivedDataTimestamps = new Map();
    this.packageReceivedFromPeers = new Set();
    this.startedAtTimestamp = null;
    this.peerOptions = options.rtcPeerConnectionOptions || {};
    this.peerSdpTransform = options.sdpTransform || ((sdp) => sdp);

    this.workerUrl = options.workerUrl || 'https://p2pcf.minddrop.workers.dev';

    if (this.workerUrl.endsWith('/')) {
      this.workerUrl = this.workerUrl.substring(0, this.workerUrl.length - 1);
    }

    this.stunIceServers = options.stunIceServers || DEFAULT_STUN_ICE;
    this.turnIceServers = options.turnIceServers || DEFAULT_TURN_ICE;
    this.networkChangePollIntervalMs =
      options.networkChangePollIntervalMs || 15000;

    this.stateExpirationIntervalMs =
      options.stateExpirationIntervalMs || 2 * 60 * 1000;
    this.stateHeartbeatWindowMs = options.stateHeartbeatWindowMs || 30000;

    this.fastPollingDurationMs = options.fastPollingDurationMs || 10000;
    this.fastPollingRateMs = options.fastPollingRateMs || 1500;
    this.slowPollingRateMs = options.slowPollingRateMs || 5000;
    this.idlePollingAfterMs = options.idlePollingAfterMs || Infinity;
    this.idlePollingRateMs = options.idlePollingRateMs || Infinity;

    this.udpEnabled = null;
    this.isSymmetric = null;
    this.dtlsFingerprint = null;
    this.reflexiveIps = new Set();

    this.isSending = false;
    this.finished = false;
    this.nextStepTime = -1;
    this.deleteKey = null;
    this.sentFirstPoll = false;
    this.stopFastPollingAt = now + this.fastPollingDurationMs;
    this.startIdlePollingAt = now + this.idlePollingAfterMs;

    this.contextId = randomstring(20);
  }

  async start() {
    this.startedAtTimestamp = Date.now();

    const [udpEnabled, isSymmetric, reflexiveIps, dtlsFingerprint] =
      await this._getNetworkSettings();

    if (this.finished) return;

    this.udpEnabled = udpEnabled;
    this.isSymmetric = isSymmetric;
    this.reflexiveIps = reflexiveIps;
    this.dtlsFingerprint = dtlsFingerprint;

    this.networkSettingsInterval = setInterval(async () => {
      const [
        newUdpEnabled,
        newIsSymmetric,
        newReflexiveIps,
        newDtlsFingerprint,
      ] = await this._getNetworkSettings();

      if (
        newUdpEnabled !== this.udpEnabled ||
        newIsSymmetric !== this.isSymmetric ||
        newDtlsFingerprint !== this.dtlsFingerprint ||
        !!Array.from(newReflexiveIps).find(
          (ip) => !Array.from(this.reflexiveIps).find((ip2) => ip === ip2)
        ) ||
        !!Array.from(this.reflexiveIps).find(
          (ip) => !Array.from(newReflexiveIps).find((ip2) => ip === ip2)
        )
      ) {
        this.dataTimestamp = null;
      }

      this.udpEnabled = newUdpEnabled;
      this.isSymmetric = newIsSymmetric;
      this.reflexiveIps = newReflexiveIps;
      this.dtlsFingerprint = newDtlsFingerprint;
    }, this.networkChangePollIntervalMs);

    this.stepInterval = setInterval(() => this._step(), 500);
  }

  send(peer: SimplePeer, msg: ArrayBuffer | Uint8Array) {
    if (!peer.connected) return;

    let dataArrBuffer: ArrayBuffer;

    if (msg instanceof ArrayBuffer) {
      dataArrBuffer = msg;
    } else if (msg instanceof Uint8Array) {
      if (msg.buffer.byteLength === msg.length) {
        dataArrBuffer = msg.buffer as ArrayBuffer;
      } else {
        dataArrBuffer = msg.buffer.slice(
          msg.byteOffset,
          msg.byteOffset + msg.byteLength
        ) as ArrayBuffer;
      }
    } else {
      throw new Error('Unsupported send data type');
    }

    let messageId: number | null = null;

    if (
      dataArrBuffer.byteLength > MAX_MESSAGE_LENGTH_BYTES ||
      new Uint16Array(dataArrBuffer, 0, 1)[0] === CHUNK_MAGIC_WORD
    ) {
      messageId = Math.floor(Math.random() * 256 * 128);
    }

    if (messageId !== null) {
      for (
        let offset = 0, chunkId = 0;
        offset < dataArrBuffer.byteLength;
        offset += CHUNK_MAX_LENGTH_BYTES, chunkId++
      ) {
        const chunkSize = Math.min(
          CHUNK_MAX_LENGTH_BYTES,
          dataArrBuffer.byteLength - offset
        );
        let bufSize = CHUNK_HEADER_LENGTH_BYTES + chunkSize;

        while (bufSize % 4 !== 0) {
          bufSize++;
        }

        const buf = new ArrayBuffer(bufSize);
        new Uint8Array(buf, CHUNK_HEADER_LENGTH_BYTES).set(
          new Uint8Array(dataArrBuffer, offset, chunkSize)
        );
        const u16 = new Uint16Array(buf);
        const u32 = new Uint32Array(buf);

        u16[0] = CHUNK_MAGIC_WORD;
        u16[1] = messageId;
        u16[2] = chunkId;
        u16[3] =
          offset + CHUNK_MAX_LENGTH_BYTES >= dataArrBuffer.byteLength ? 1 : 0;
        u32[2] = dataArrBuffer.byteLength;

        peer.send(buf);
      }
    } else {
      peer.send(dataArrBuffer);
    }
  }

  broadcast(msg: ArrayBuffer | Uint8Array) {
    for (const peer of this.peers.values()) {
      this.send(peer, msg);
    }
  }

  destroy() {
    if (!this.finished) {
      this._step(true);
    }

    if (this.networkSettingsInterval) {
      clearInterval(this.networkSettingsInterval);
      this.networkSettingsInterval = null;
    }

    if (this.stepInterval) {
      clearInterval(this.stepInterval);
      this.stepInterval = null;
    }

    for (const peer of this.peers.values()) {
      peer.destroy();
    }
  }

  private async _step(finish = false) {
    const now = Date.now();

    if (finish) {
      if (this.finished) return;
      if (!this.deleteKey) return;
      this.finished = true;
    } else {
      if (this.nextStepTime > now) return;
      if (this.isSending) return;
      if (this.reflexiveIps.size === 0) return;
    }

    this.isSending = true;

    try {
      const localDtlsFingerprintBase64 = hexToBase64(
        this.dtlsFingerprint!.replace(/:/g, '')
      );

      const localPeerInfo = [
        this.sessionId,
        this.clientId,
        this.isSymmetric,
        localDtlsFingerprintBase64,
        this.startedAtTimestamp,
        Array.from(this.reflexiveIps),
      ];

      const payload: any = { r: this.roomId, k: this.contextId };

      if (finish) {
        payload.dk = this.deleteKey;
      }

      const expired =
        this.dataTimestamp === null ||
        now - this.dataTimestamp >=
          this.stateExpirationIntervalMs - this.stateHeartbeatWindowMs;

      const packagesChanged =
        this.lastPackages !== JSON.stringify(this.packages);
      let includePackages = false;

      if (expired || packagesChanged || finish) {
        this.dataTimestamp = now;

        removeInPlace(this.packages, (pkg) => {
          const sentAt = pkg[pkg.length - 2];
          return now - sentAt > 60 * 1000;
        });

        includePackages = true;
      }

      if (finish) {
        includePackages = false;
      }

      if (this.sentFirstPoll) {
        payload.d = localPeerInfo;
        payload.t = this.dataTimestamp;
        payload.x = this.stateExpirationIntervalMs;

        if (includePackages) {
          payload.p = this.packages;
          this.lastPackages = JSON.stringify(this.packages);
        }
      }

      const body = JSON.stringify(payload);
      const headers: any = { 'Content-Type': 'application/json' };

      if (finish) {
        headers['X-Worker-Method'] = 'DELETE';
      }

      const res = await fetch(this.workerUrl, {
        method: 'POST',
        headers,
        body,
      });

      const { ps: remotePeerDatas, pk: remotePackages, dk } = await res.json();

      if (dk) {
        this.deleteKey = dk;
      }

      if (finish) return;

      if (remotePeerDatas.length === 0 && !this.sentFirstPoll) {
        payload.d = localPeerInfo;
        payload.t = this.dataTimestamp;
        payload.x = this.stateExpirationIntervalMs;
        payload.p = this.packages;
        this.lastPackages = JSON.stringify(this.packages);

        const emptyRes = await fetch(this.workerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const { dk: emptyDk } = await emptyRes.json();

        if (emptyDk) {
          this.deleteKey = emptyDk;
        }
      }

      this.sentFirstPoll = true;

      const previousPeerSessionIds = Array.from(this.peers.keys());

      this._handleWorkerResponse(
        localPeerInfo,
        localDtlsFingerprintBase64,
        this.packages,
        remotePeerDatas,
        remotePackages
      );

      const activeSessionIds = remotePeerDatas.map((p: any) => p[0]);

      const peersChanged =
        previousPeerSessionIds.length !== activeSessionIds.length ||
        activeSessionIds.find(
          (c: string) => !previousPeerSessionIds.includes(c)
        ) ||
        previousPeerSessionIds.find(
          (c: string) => !activeSessionIds.includes(c)
        );

      if (peersChanged) {
        this.stopFastPollingAt = now + this.fastPollingDurationMs;
        this.startIdlePollingAt = now + this.idlePollingAfterMs;
      }

      if (now < this.stopFastPollingAt) {
        this.nextStepTime = now + this.fastPollingRateMs;
      } else if (now > this.startIdlePollingAt) {
        this.nextStepTime = now + this.idlePollingRateMs;
      } else {
        this.nextStepTime = now + this.slowPollingRateMs;
      }
    } catch (e) {
      console.error(e);
      this.nextStepTime = now + this.slowPollingRateMs;
    } finally {
      this.isSending = false;
    }
  }

  private _handleWorkerResponse(
    localPeerData: any[],
    _localDtlsFingerprintBase64: string,
    localPackages: any[],
    remotePeerDatas: any[],
    remotePackages: any[]
  ) {
    const localStartedAtTimestamp = this.startedAtTimestamp!;
    const [localSessionId, , localSymmetric] = localPeerData;
    const now = Date.now();

    for (const remotePeerData of remotePeerDatas) {
      const [
        remoteSessionId,
        remoteClientId,
        remoteSymmetric,
        remoteDtlsFingerprintBase64,
        remoteStartedAtTimestamp,
        remoteReflexiveIps,
        remoteDataTimestamp,
      ] = remotePeerData;

      if (
        this.lastProcessedReceivedDataTimestamps.get(remoteSessionId) ===
        remoteDataTimestamp
      ) {
        continue;
      }

      const isPeerA =
        localSymmetric === remoteSymmetric
          ? localStartedAtTimestamp === remoteStartedAtTimestamp
            ? localSessionId > remoteSessionId
            : localStartedAtTimestamp > remoteStartedAtTimestamp
          : localSymmetric;

      const iceServers =
        localSymmetric || remoteSymmetric
          ? this.turnIceServers
          : this.stunIceServers;

      const remotePackage = remotePackages.find(
        (p: any) => p[1] === remoteSessionId
      );

      const peerOptions = { ...this.peerOptions, config: { iceServers } };

      if (isPeerA) {
        if (this.peers.has(remoteSessionId)) continue;
        if (!remotePackage) continue;

        this.lastProcessedReceivedDataTimestamps.set(
          remoteSessionId,
          remoteDataTimestamp
        );

        if (this.packageReceivedFromPeers.has(remoteSessionId)) continue;
        this.packageReceivedFromPeers.add(remoteSessionId);

        const [
          ,
          ,
          remoteIceUFrag,
          remoteIcePwd,
          remoteDtlsFingerprintBase64Peer,
          localIceUFrag,
          localIcePwd,
          ,
          remoteCandidates,
        ] = remotePackage;

        const peer = new SimplePeerImplementation({
          ...peerOptions,
          initiator: false,
          sdpTransform: (sdp: string) => {
            const lines = [];

            for (const l of sdp.split('\r\n')) {
              if (l.startsWith('a=ice-ufrag')) {
                lines.push(`a=ice-ufrag:${localIceUFrag}`);
              } else if (l.startsWith('a=ice-pwd')) {
                lines.push(`a=ice-pwd:${localIcePwd}`);
              } else {
                lines.push(l);
              }
            }

            return this.peerSdpTransform(lines.join('\r\n'));
          },
        }) as SimplePeer;

        peer.id = remoteSessionId;
        peer.client_id = remoteClientId;

        this._wireUpCommonPeerEvents(peer);

        this.peers.set(peer.id!, peer);

        const pkg = [
          remoteSessionId,
          localSessionId,
          null,
          null,
          null,
          null,
          null,
          now,
          [],
        ];

        const pkgCandidates = pkg[pkg.length - 1] as string[];

        let finishIceTimeout: any = null;

        const finishIce = () => {
          peer.removeListener('signal', initialCandidateSignalling);
          if (localPackages.includes(pkg)) return;
          if (pkgCandidates.length === 0) return;
          localPackages.push(pkg);
        };

        const initialCandidateSignalling = (e: any) => {
          if (!e.candidate) return;

          clearTimeout(finishIceTimeout);

          if (e.candidate.candidate) {
            pkgCandidates.push(e.candidate.candidate);
            finishIceTimeout = setTimeout(finishIce, TRICKLE_ICE_TIMEOUT);
          } else {
            finishIce();
          }
        };

        peer.on('signal', initialCandidateSignalling);

        setTimeout(() => {
          if (peer._iceComplete || peer.connected) return;

          console.warn("Peer A didn't connect in time", peer.id);
          peer._iceComplete = true;
          this._removePeer(peer, true);
          this._updateConnectedSessions();
        }, CONNECT_TIMEOUT);

        const remoteSdp = createSdp(
          true,
          remoteIceUFrag,
          remoteIcePwd,
          remoteDtlsFingerprintBase64Peer
        );

        for (const candidate of remoteCandidates) {
          peer.signal({ candidate: { candidate, sdpMLineIndex: 0 } });
        }

        peer.signal({ type: 'offer', sdp: remoteSdp });
      } else {
        if (!this.peers.has(remoteSessionId)) {
          this.lastProcessedReceivedDataTimestamps.set(
            remoteSessionId,
            remoteDataTimestamp
          );

          const remoteUfrag = randomstring(12);
          const remotePwd = randomstring(32);
          const peer = new SimplePeerImplementation({
            ...peerOptions,
            initiator: true,
          }) as SimplePeer;

          peer.id = remoteSessionId;
          peer.client_id = remoteClientId;

          this._wireUpCommonPeerEvents(peer);

          this.peers.set(peer.id!, peer);

          const pkg = [
            remoteSessionId,
            localSessionId,
            null,
            null,
            null,
            remoteUfrag,
            remotePwd,
            now,
            [],
          ];

          const pkgCandidates = pkg[pkg.length - 1] as string[];

          let finishIceTimeout: any = null;

          const finishIce = () => {
            peer.removeListener('signal', initialCandidateSignalling);

            if (localPackages.includes(pkg)) return;
            if (pkgCandidates.length === 0) return;

            localPackages.push(pkg);
          };

          const initialCandidateSignalling = (e: any) => {
            if (!e.candidate) return;
            clearTimeout(finishIceTimeout);

            if (e.candidate.candidate) {
              pkgCandidates.push(e.candidate.candidate);
              finishIceTimeout = setTimeout(finishIce, TRICKLE_ICE_TIMEOUT);
            } else {
              finishIce();
            }
          };

          peer.on('signal', initialCandidateSignalling);

          setTimeout(() => {
            if (peer._iceComplete || peer.connected) return;

            console.warn('Peer B failed to connect in time', peer.id);
            peer._iceComplete = true;
            this._removePeer(peer, true);
            this._updateConnectedSessions();
          }, CONNECT_TIMEOUT);

          const enqueuePackageFromOffer = (e: any) => {
            if (e.type !== 'offer') return;
            peer.removeListener('signal', enqueuePackageFromOffer);

            for (const l of e.sdp.split('\r\n')) {
              switch (l.split(':')[0]) {
                case 'a=ice-ufrag':
                  pkg[2] = l.substring(12);
                  break;
                case 'a=ice-pwd':
                  pkg[3] = l.substring(10);
                  break;
                case 'a=fingerprint':
                  pkg[4] = hexToBase64(l.substring(22).replace(/:/g, ''));
                  break;
              }
            }

            let remoteSdp = createSdp(
              false,
              remoteUfrag,
              remotePwd,
              remoteDtlsFingerprintBase64
            );

            for (let i = 0; i < remoteReflexiveIps.length; i++) {
              remoteSdp += `a=candidate:0 1 udp ${i + 1} ${
                remoteReflexiveIps[i]
              } 30000 typ srflx\r\n`;
            }

            peer._pendingRemoteSdp = remoteSdp;
            peer.signal({ type: 'answer', sdp: remoteSdp });
          };

          peer.once('signal', enqueuePackageFromOffer);
        }

        if (!remotePackage) continue;

        const [, , , , , , , , remoteCandidates] = remotePackage;
        if (this.packageReceivedFromPeers.has(remoteSessionId)) continue;
        if (!this.peers.has(remoteSessionId)) continue;

        const peer = this.peers.get(remoteSessionId)!;

        if (
          !peer._pc.remoteDescription &&
          peer._pendingRemoteSdp &&
          remoteCandidates.length > 0
        ) {
          if (!peer.connected) {
            for (const candidate of remoteCandidates) {
              peer.signal({ candidate: { candidate, sdpMLineIndex: 0 } });
            }
          }

          peer.signal({ type: 'answer', sdp: peer._pendingRemoteSdp });
          delete peer._pendingRemoteSdp;
          this.packageReceivedFromPeers.add(remoteSessionId);
        }

        if (
          peer._pc.remoteDescription &&
          remoteCandidates.length > 0 &&
          !this.packageReceivedFromPeers.has(remoteSessionId)
        ) {
          if (!peer.connected) {
            for (const candidate of remoteCandidates) {
              peer.signal({ candidate: { candidate, sdpMLineIndex: 0 } });
            }
          }

          this.packageReceivedFromPeers.add(remoteSessionId);
        }
      }
    }

    const remoteSessionIds = remotePeerDatas.map((p: any) => p[0]);

    for (const [sessionId, peer] of this.peers.entries()) {
      if (remoteSessionIds.includes(sessionId)) continue;

      if (!peer.connected) {
        console.warn('Removing unconnected peer not in peer list', peer.id);
        this._removePeer(peer, true);
      }
    }
  }

  private _removePeer(peer: SimplePeer, destroy = false) {
    if (!this.peers.has(peer.id!)) return;

    removeInPlace(this.packages, (pkg) => pkg[0] === peer.id);
    this.packageReceivedFromPeers.delete(peer.id!);

    this.peers.delete(peer.id!);

    if (destroy) {
      peer.destroy();
    }

    this.emit('peerclose', peer);
  }

  private _updateConnectedSessions() {
    this.connectedSessions.length = 0;

    for (const [sessionId, peer] of this.peers) {
      if (peer.connected) {
        this.connectedSessions.push(sessionId);
      }
    }
  }

  private async _getNetworkSettings(): Promise<
    [boolean, boolean, Set<string>, string]
  > {
    let dtlsFingerprint = '';
    const candidates: (number | string | null)[][] = [];
    const reflexiveIps = new Set<string>();

    const peerOptions = { iceServers: this.stunIceServers };

    const pc = new RTCPeerConnection(peerOptions);
    pc.createDataChannel('x');

    const p = new Promise<void>((resolve) => {
      setTimeout(() => resolve(), 5000);

      (pc as any).onicecandidate = (e: any) => {
        if (!e.candidate) return resolve();

        if (e.candidate.candidate) {
          candidates.push(parseCandidate(e.candidate.candidate));
        }
      };
    });

    const offer = await pc.createOffer();

    for (const l of offer.sdp!.split('\n')) {
      if (l.indexOf('a=fingerprint') === -1) continue;
      dtlsFingerprint = l.split(' ')[1]!.trim();
    }

    await pc.setLocalDescription(offer);
    await p;

    pc.close();

    let isSymmetric = false;
    let udpEnabled = false;

    for (const c of candidates) {
      if (c[0] !== CANDIDATE_TYPES.srflx) continue;
      udpEnabled = true;

      reflexiveIps.add(c[CANDIDATE_IDX.IP] as string);

      for (const d of candidates) {
        if (d[0] !== CANDIDATE_TYPES.srflx) continue;
        if (c === d) continue;

        if (
          typeof c[CANDIDATE_IDX.RELATED_PORT] === 'number' &&
          typeof d[CANDIDATE_IDX.RELATED_PORT] === 'number' &&
          c[CANDIDATE_IDX.RELATED_PORT] === d[CANDIDATE_IDX.RELATED_PORT] &&
          c[CANDIDATE_IDX.PORT] !== d[CANDIDATE_IDX.PORT]
        ) {
          isSymmetric = true;
          break;
        }
      }
    }

    return [udpEnabled, isSymmetric, reflexiveIps, dtlsFingerprint];
  }

  private _chunkHandler(data: ArrayBuffer, messageId: number, chunkId: number) {
    let target: Uint8Array;

    if (!this.msgChunks.has(messageId)) {
      const totalLength = new Uint32Array(data, 0, 3)[2]!;
      target = new Uint8Array(totalLength);
      this.msgChunks.set(messageId, target);
    } else {
      target = this.msgChunks.get(messageId)!;
    }

    const offsetToSet = chunkId * CHUNK_MAX_LENGTH_BYTES;

    const numBytesToSet = Math.min(
      target.byteLength - offsetToSet,
      CHUNK_MAX_LENGTH_BYTES
    );

    target.set(
      new Uint8Array(data, CHUNK_HEADER_LENGTH_BYTES, numBytesToSet),
      chunkId * CHUNK_MAX_LENGTH_BYTES
    );

    return target.buffer;
  }

  private _checkForSignalOrEmitMessage(peer: SimplePeer, msg: ArrayBuffer) {
    if (msg.byteLength < SIGNAL_MESSAGE_HEADER_WORDS.length * 2) {
      this.emit('msg', peer, msg);
      return;
    }

    const u16 = new Uint16Array(msg, 0, SIGNAL_MESSAGE_HEADER_WORDS.length);

    for (let i = 0; i < SIGNAL_MESSAGE_HEADER_WORDS.length; i++) {
      if (u16[i] !== SIGNAL_MESSAGE_HEADER_WORDS[i]) {
        this.emit('msg', peer, msg);
        return;
      }
    }

    const u8 = new Uint8Array(msg, SIGNAL_MESSAGE_HEADER_WORDS.length * 2);

    let payload = arrToText(u8);

    if (payload.endsWith('\0')) {
      payload = payload.substring(0, payload.length - 1);
    }

    peer.signal(JSON.parse(payload));
  }

  private _wireUpCommonPeerEvents(peer: SimplePeer) {
    peer.on('connect', () => {
      this.emit('peerconnect', peer);

      removeInPlace(this.packages, (pkg) => pkg[0] === peer.id);
      this._updateConnectedSessions();
    });

    peer.on('data', (data: ArrayBuffer) => {
      let messageId: number | null = null;
      let u16: Uint16Array | null = null;
      if (data.byteLength >= CHUNK_HEADER_LENGTH_BYTES) {
        u16 = new Uint16Array(data, 0, CHUNK_HEADER_LENGTH_BYTES / 2);

        if (u16[0] === CHUNK_MAGIC_WORD) {
          messageId = u16[1]!;
        }
      }
      if (messageId !== null && u16) {
        try {
          const chunkId = u16[2]!;
          const last = u16[3] !== 0;
          const msg = this._chunkHandler(data, messageId, chunkId);
          if (last) {
            this._checkForSignalOrEmitMessage(peer, msg as ArrayBuffer);
            this.msgChunks.delete(messageId);
          }
        } catch (e) {
          console.error(e);
        }
      } else {
        this._checkForSignalOrEmitMessage(peer, data);
      }
    });

    peer.on('error', (err: Error) => {
      console.warn(err);
    });

    peer.on('close', () => {
      this._removePeer(peer);
      this._updateConnectedSessions();
    });

    peer.on('signal', (signalData: any) => {
      const payloadBytes = textToArr(JSON.stringify(signalData));

      let len =
        payloadBytes.byteLength + SIGNAL_MESSAGE_HEADER_WORDS.length * 2;

      if (len % 2 !== 0) {
        len++;
      }

      const buf = new ArrayBuffer(len);
      const u8 = new Uint8Array(buf);
      const u16 = new Uint16Array(buf);

      u8.set(payloadBytes, SIGNAL_MESSAGE_HEADER_WORDS.length * 2);

      for (let i = 0; i < SIGNAL_MESSAGE_HEADER_WORDS.length; i++) {
        u16[i] = SIGNAL_MESSAGE_HEADER_WORDS[i]!;
      }

      this.send(peer, buf);
    });
  }
}
