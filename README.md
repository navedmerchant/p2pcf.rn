# p2pcf.rn

Peer-to-peer WebRTC connections for React Native using Cloudflare Workers as a signaling server. This is a React Native port of the original [p2pcf](https://github.com/gfodor/p2pcf) library.

## Features

- 🚀 Simple peer-to-peer WebRTC connections in React Native
- ☁️ Uses Cloudflare Workers for signaling (no server setup required)
- 🔒 Secure connections with DTLS
- 📱 Cross-platform (iOS & Android)
- 🎯 TypeScript support
- 📦 Small bundle size

## Installation

```bash
npm install p2pcf.rn react-native-webrtc
# or
yarn add p2pcf.rn react-native-webrtc
```

### iOS Setup

```bash
cd ios && pod install
```

Add the following to your `Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>Camera access for WebRTC</string>
<key>NSMicrophoneUsageDescription</key>
<string>Microphone access for WebRTC</string>
```

### Android Setup

Update your `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.CHANGE_NETWORK_STATE" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

## Usage

### Basic Example

```typescript
import P2PCF, { type Peer } from 'p2pcf.rn';

// Create a P2PCF instance
const p2pcf = new P2PCF('my-client-id', 'my-room-id', {
  workerUrl: 'https://p2pcf.minddrop.workers.dev',
});

// Listen for peer connections
p2pcf.on('peerconnect', (peer: Peer) => {
  console.log('Peer connected:', peer.id);
});

// Listen for messages
p2pcf.on('msg', (peer: Peer, data: ArrayBuffer) => {
  const decoder = new TextDecoder();
  const message = decoder.decode(data);
  console.log('Received message:', message);
});

// Listen for peer disconnections
p2pcf.on('peerclose', (peer: Peer) => {
  console.log('Peer disconnected:', peer.id);
});

// Start the connection
await p2pcf.start();

// Send a message to all peers
const encoder = new TextEncoder();
const data = encoder.encode('Hello, peers!');
p2pcf.broadcast(data.buffer);

// Send to a specific peer
const peer = Array.from(p2pcf.peers.values())[0];
if (peer) {
  p2pcf.send(peer, data.buffer);
}

// Clean up when done
p2pcf.destroy();
```

### React Hook Example

```typescript
import { useEffect, useRef, useState } from 'react';
import P2PCF, { type Peer } from 'p2pcf.rn';

function useP2PCF(clientId: string, roomId: string) {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const p2pcfRef = useRef<P2PCF | null>(null);

  useEffect(() => {
    if (!clientId || !roomId) return;

    const p2pcf = new P2PCF(clientId, roomId);

    p2pcf.on('peerconnect', (peer: Peer) => {
      setPeers((prev) => [...prev, peer]);
    });

    p2pcf.on('peerclose', (peer: Peer) => {
      setPeers((prev) => prev.filter((p) => p.id !== peer.id));
    });

    p2pcf.start().then(() => {
      setIsConnected(true);
    });

    p2pcfRef.current = p2pcf;

    return () => {
      p2pcf.destroy();
    };
  }, [clientId, roomId]);

  const sendMessage = (message: string) => {
    if (p2pcfRef.current) {
      const encoder = new TextEncoder();
      const data = encoder.encode(message);
      p2pcfRef.current.broadcast(data.buffer);
    }
  };

  return { peers, isConnected, sendMessage };
}
```

## API Reference

### Constructor

```typescript
new P2PCF(clientId: string, roomId: string, options?: P2PCFOptions)
```

**Parameters:**
- `clientId` (string, required): Unique identifier for this client (minimum 4 characters)
- `roomId` (string, required): Room identifier to join (minimum 4 characters)
- `options` (P2PCFOptions, optional): Configuration options

### P2PCFOptions

```typescript
interface P2PCFOptions {
  workerUrl?: string; // Default: 'https://p2pcf.minddrop.workers.dev'
  stunIceServers?: any[];
  turnIceServers?: any[];
  rtcPeerConnectionOptions?: any;
  networkChangePollIntervalMs?: number; // Default: 15000
  stateExpirationIntervalMs?: number; // Default: 120000
  fastPollingRateMs?: number; // Default: 1500
  slowPollingRateMs?: number; // Default: 5000
}
```

### Methods

#### `start(): Promise<void>`
Start the P2PCF connection and begin discovering peers.

#### `send(peer: Peer, data: ArrayBuffer | Uint8Array): void`
Send data to a specific peer.

#### `broadcast(data: ArrayBuffer | Uint8Array): void`
Send data to all connected peers.

#### `destroy(): void`
Close all connections and clean up resources.

### Events

#### `peerconnect`
Emitted when a new peer connects.

```typescript
p2pcf.on('peerconnect', (peer: Peer) => {
  console.log('Peer connected:', peer.id);
});
```

#### `peerclose`
Emitted when a peer disconnects.

```typescript
p2pcf.on('peerclose', (peer: Peer) => {
  console.log('Peer disconnected:', peer.id);
});
```

#### `msg`
Emitted when a message is received from a peer.

```typescript
p2pcf.on('msg', (peer: Peer, data: ArrayBuffer) => {
  const decoder = new TextDecoder();
  const message = decoder.decode(data);
  console.log('Received:', message);
});
```

#### `error`
Emitted when an error occurs.

```typescript
p2pcf.on('error', (error: Error) => {
  console.error('Error:', error);
});
```

### Properties

#### `peers: Map<string, Peer>`
Map of all connected peers, keyed by session ID.

#### `connectedSessions: string[]`
Array of session IDs for all connected peers.

#### `clientId: string`
The client ID for this instance.

#### `roomId: string`
The room ID for this instance.

## How It Works

p2pcf.rn uses WebRTC for peer-to-peer data connections and Cloudflare Workers as a lightweight signaling server:

1. **Connection Setup**: When you call `start()`, the library connects to the Cloudflare Worker
2. **Peer Discovery**: It polls the worker to discover other peers in the same room
3. **WebRTC Negotiation**: Peers exchange ICE candidates and SDP offers/answers through the worker
4. **Direct Connection**: Once negotiation completes, peers connect directly via WebRTC DataChannels
5. **Data Transfer**: All subsequent data flows peer-to-peer without going through the worker

## Signaling Server

By default, the library uses a public Cloudflare Worker at `https://p2pcf.minddrop.workers.dev`. You can deploy your own worker for production use:

1. Clone the [p2pcf repository](https://github.com/gfodor/p2pcf)
2. Deploy the worker using Wrangler
3. Pass your worker URL in the options

## Limitations

- Maximum message size: ~16KB per message (automatically chunked for larger messages)
- Room capacity: Depends on your signaling server configuration
- NAT traversal: Some network configurations may require TURN servers

## Example App

The example app demonstrates a simple chat application:

```bash
cd example
yarn install
yarn ios
# or
yarn android
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Credits

- Original p2pcf library by [Greg Fodor](https://github.com/gfodor)
- React Native port by [Naved Merchant](https://github.com/navedmerchant)

## Related Projects

- [p2pcf](https://github.com/gfodor/p2pcf) - Original browser implementation
- [react-native-webrtc](https://github.com/react-native-webrtc/react-native-webrtc) - WebRTC for React Native
