# p2pcf.rn

Peer-to-peer WebRTC connections for React Native using Cloudflare Workers as a signaling server. This is a React Native port of the original [p2pcf](https://github.com/gfodor/p2pcf) library, rewritten in TypeScript with a desktop-hub star topology architecture.

## Architecture

**Asymmetric Desktop-Hub Star Topology:**
- **Desktop** acts as the hub, managing multiple connections to mobile clients
- **Mobile** clients connect only to the desktop (not to each other)
- Perfect for scenarios where a desktop app coordinates multiple mobile devices
- Mobile devices initiate connections, desktop accepts them

```
       Mobile 1
          |
Mobile 2--Desktop--Mobile 3
          |
       Mobile 4
```

## Features

- 🚀 Simple peer-to-peer WebRTC connections in React Native and web browsers
- ☁️ Uses Cloudflare Workers for signaling (no server setup required)
- 🔒 Secure connections with DTLS
- 📱 Cross-platform (iOS, Android, and Web)
- 🎯 Full TypeScript support
- 📦 Small bundle size
- 🔌 Compatible with the original p2pcf worker.js
- 🌐 Works in both React Native and web browser environments - copy/paste the same TypeScript code

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

### Desktop Example (Hub)

```typescript
import { P2PCF, type Peer } from 'p2pcf.rn';

// Create desktop instance (hub that accepts connections)
const desktop = new P2PCF('desktop-1', 'my-room', {
  isDesktop: true,
  workerUrl: 'https://p2pcf.minddrop.workers.dev',
});

// Listen for mobile peer connections
desktop.on('peerconnect', (peer: Peer) => {
  console.log('Mobile connected:', peer.clientId);
});

// Listen for messages from mobile peers
desktop.on('msg', (peer: Peer, data: ArrayBuffer) => {
  const text = new TextDecoder().decode(data);
  console.log(`Message from ${peer.clientId}:`, text);
});

// Start listening for connections
await desktop.start();

// Send to specific mobile peer
const mobilePeer = desktop.getPeers()[0];
if (mobilePeer) {
  desktop.send(mobilePeer, 'Hello mobile!');
}

// Broadcast to all connected mobile peers
desktop.broadcast('Hello everyone!');
```

### Mobile Example (Client)

```typescript
import { P2PCF, type Peer } from 'p2pcf.rn';

// Create mobile instance (connects to desktop)
const mobile = new P2PCF('mobile-1', 'my-room', {
  isDesktop: false,
  workerUrl: 'https://p2pcf.minddrop.workers.dev',
});

// Listen for desktop connection
mobile.on('peerconnect', (peer: Peer) => {
  console.log('Connected to desktop:', peer.clientId);
});

// Listen for messages from desktop
mobile.on('msg', (peer: Peer, data: ArrayBuffer) => {
  const text = new TextDecoder().decode(data);
  console.log('Message from desktop:', text);
});

// Start and connect to desktop
await mobile.start();

// Send to desktop (broadcast sends to desktop only in mobile mode)
mobile.broadcast('Hello from mobile!');
```

### Web Browser Usage

The same TypeScript code works in web browsers! Just copy/paste the P2PCF class:

```typescript
// In your web app (desktop hub)
import { P2PCF } from './P2PCF'; // Copy P2PCF.ts to your web project

const desktop = new P2PCF('web-desktop', 'my-room', {
  isDesktop: true,
  workerUrl: 'https://p2pcf.minddrop.workers.dev',
});

await desktop.start();
// Now mobile React Native apps can connect to this web desktop!
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
      const data = textToArrayBuffer(message);
      p2pcfRef.current.broadcast(data);
    }
  };

  return { peers, isConnected, sendMessage };
}
```

## API Reference

### Constructor

```typescript
new P2PCF(clientId: string, roomId: string, options: P2PCFOptions)
```

**Parameters:**
- `clientId` (string, required): Unique identifier for this client
- `roomId` (string, required): Room identifier to join
- `options` (P2PCFOptions, required): Configuration options

### P2PCFOptions

```typescript
interface P2PCFOptions {
  isDesktop: boolean;                // Required: true for hub, false for client
  workerUrl?: string;                // Cloudflare Worker URL
  rtcConfig?: RTCConfiguration;      // WebRTC config (STUN/TURN servers)
  pollingInterval?: number;          // Worker polling interval in ms (default: 3000)
}
```

**Important:** You must specify `isDesktop`:
- `isDesktop: true` - Acts as desktop hub, accepts connections from mobile clients
- `isDesktop: false` - Acts as mobile client, initiates connection to desktop

### Methods

#### `start(): Promise<void>`
Start the P2PCF connection and begin discovering peers.

#### `send(peer: Peer, data: ArrayBuffer | Uint8Array): void`
Send data to a specific peer.

#### `broadcast(data: ArrayBuffer | string): void`
Send data to all connected peers.
- **Desktop mode:** Broadcasts to all connected mobile peers
- **Mobile mode:** Sends only to the connected desktop peer

#### `getPeers(): Peer[]`
Get list of all connected peers.

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
  const message = arrayBufferToText(data);
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

### Peer Object

```typescript
interface Peer {
  id: string;         // Session ID
  clientId: string;   // Client identifier
  isDesktop: boolean; // Whether this peer is a desktop
}
```

## How It Works

p2pcf.rn uses an asymmetric desktop-hub star topology with WebRTC data connections:

1. **Desktop Hub Setup**: Desktop peer starts and registers with the Cloudflare Worker as `isDesktop: true`
2. **Mobile Discovery**: Mobile peers poll the worker and discover the desktop peer
3. **Connection Initiation**: Mobile peers create offers and send them to desktop via the worker
4. **Desktop Acceptance**: Desktop receives offers and sends back answers, establishing WebRTC connections
5. **Direct Communication**: Once connected, all data flows peer-to-peer via WebRTC DataChannels
6. **Broadcasting**: Desktop can send to all mobile peers; mobile peers send only to desktop

### Connection Flow

```
Mobile                Worker              Desktop
  |                     |                    |
  |-- Poll for peers -->|                    |
  |                     |<-- Register -------|
  |<-- Desktop found ---|                    |
  |                     |                    |
  |-- Send offer ------>|                    |
  |                     |-- Deliver offer -->|
  |                     |<-- Send answer ----|
  |<-- Receive answer --|                    |
  |                     |                    |
  |<===== Direct WebRTC DataChannel =======>|
```

## Signaling Server

This library is **100% compatible with the original p2pcf worker.js** from [gfodor/p2pcf](https://github.com/gfodor/p2pcf).

You can:
1. Use the default public worker: `https://p2pcf.minddrop.workers.dev`
2. Deploy the original p2pcf worker.js using Wrangler
3. Use any existing p2pcf worker deployment

**To deploy your own:**
1. Clone the [p2pcf repository](https://github.com/gfodor/p2pcf)
2. Deploy the worker using Wrangler: `wrangler deploy`
3. Pass your worker URL in the options

## Cross-Platform Usage

**The TypeScript source code works in both React Native and web browsers!** You can copy/paste [src/P2PCF.ts](src/P2PCF.ts) into your web application and it will work out of the box.

### Why it works everywhere:

1. **Platform Detection**: Automatically detects React Native vs web browser environment
2. **WebRTC Abstraction**: Uses `react-native-webrtc` in React Native, native WebRTC API in browsers
3. **Standard APIs**: Built on EventEmitter and standard WebRTC APIs
4. **No Platform-Specific Code**: Pure TypeScript with conditional imports

### Example: Web Desktop + React Native Mobile

```typescript
// Web app (desktop.ts) - just copy P2PCF.ts to your project
import { P2PCF } from './P2PCF';

const desktop = new P2PCF('web-desktop', 'room-123', {
  isDesktop: true,
  workerUrl: 'https://p2pcf.minddrop.workers.dev',
});

await desktop.start();
```

```typescript
// React Native app (App.tsx)
import { P2PCF } from 'p2pcf.rn';

const mobile = new P2PCF('mobile-1', 'room-123', {
  isDesktop: false,
  workerUrl: 'https://p2pcf.minddrop.workers.dev',
});

await mobile.start();
// Mobile and web desktop are now connected!
```

## Limitations

- **Topology**: Mobile peers cannot communicate directly with each other (only through desktop)
- **Message Size**: WebRTC DataChannel limits apply (~256KB per message, but check your browser)
- **NAT Traversal**: Some network configurations may require TURN servers
- **Room Capacity**: Depends on your signaling server configuration

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

## Key Differences from Original p2pcf

This library is a **TypeScript rewrite** of the original [p2pcf](https://github.com/gfodor/p2pcf) with several architectural changes:

| Feature | Original p2pcf | p2pcf.rn |
|---------|---------------|----------|
| **Language** | JavaScript | **TypeScript** |
| **Topology** | Symmetric mesh (all-to-all) | **Asymmetric star (desktop-hub)** |
| **Platform** | Web browsers only | **React Native + Web** |
| **Worker Compatibility** | Uses worker.js | **100% compatible with worker.js** |
| **Connection Model** | All peers connect to each other | **Mobile initiates, desktop accepts** |
| **API** | EventEmitter | **EventEmitter with TypeScript types** |

**When to use p2pcf.rn:**
- You need desktop-mobile coordination (desktop as hub)
- You're building a React Native app
- You want TypeScript support

**When to use original p2pcf:**
- You need peer-to-peer mesh networking (all peers equal)
- You're building a web-only app
- You prefer JavaScript

## Credits

- Original p2pcf library by [Greg Fodor](https://github.com/gfodor)
- TypeScript React Native port by [Naved Merchant](https://github.com/navedmerchant)

## Related Projects

- [p2pcf](https://github.com/gfodor/p2pcf) - Original JavaScript browser implementation (mesh topology)
- [react-native-webrtc](https://github.com/react-native-webrtc/react-native-webrtc) - WebRTC for React Native
