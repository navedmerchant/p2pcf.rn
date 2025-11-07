# React Native Implementation Notes

## TextEncoder/TextDecoder Issue

### Problem
React Native doesn't provide the Web API's `TextEncoder` and `TextDecoder` classes. These are browser-specific APIs that don't exist in React Native's JavaScript runtime (JavaScriptCore on iOS, Hermes on newer versions).

### Solution
We implemented custom text encoding/decoding functions using standard JavaScript:

```typescript
// Encode text to UTF-8 ArrayBuffer
const textToArrayBuffer = (text: string): ArrayBuffer => {
  const utf8 = unescape(encodeURIComponent(text));
  const result = new Uint8Array(utf8.length);
  for (let i = 0; i < utf8.length; i++) {
    result[i] = utf8.charCodeAt(i);
  }
  return result.buffer;
};

// Decode UTF-8 ArrayBuffer to text
const arrayBufferToText = (buffer: ArrayBuffer): string => {
  const arr = new Uint8Array(buffer);
  let result = '';
  for (let i = 0; i < arr.length; i++) {
    result += String.fromCharCode(arr[i]!);
  }
  return decodeURIComponent(escape(result));
};
```

### Implementation Details

1. **In [`src/P2PCF.ts`](src/P2PCF.ts:86)**: Internal implementation for protocol-level encoding
2. **In [`example/src/App.tsx`](example/src/App.tsx:14)**: Helper functions for application use
3. **In [`README.md`](README.md:42)**: Documentation with usage examples

### Why This Works

- `encodeURIComponent()`: Converts Unicode to percent-encoded UTF-8
- `unescape()`: Converts percent-encoding to raw bytes
- `escape()`: Converts bytes to percent-encoding
- `decodeURIComponent()`: Converts percent-encoded UTF-8 back to Unicode

This is a standard polyfill pattern used in environments without native TextEncoder/TextDecoder support.

## WebRTC Event Handlers

React Native's WebRTC implementation uses property-based event handlers instead of `addEventListener()`:

```typescript
// Use property assignment instead of addEventListener
(pc as any).onicecandidate = (event) => { /* ... */ };
(pc as any).onconnectionstatechange = () => { /* ... */ };
(pc as any).ondatachannel = (event) => { /* ... */ };
```

The `as any` type assertion is necessary because react-native-webrtc's TypeScript definitions don't include these properties.

## Usage Example

```typescript
import P2PCF, { type Peer } from 'p2pcf.rn';

// Helper functions for text conversion
const textToArrayBuffer = (text: string): ArrayBuffer => {
  const utf8 = unescape(encodeURIComponent(text));
  const result = new Uint8Array(utf8.length);
  for (let i = 0; i < utf8.length; i++) {
    result[i] = utf8.charCodeAt(i);
  }
  return result.buffer;
};

const arrayBufferToText = (buffer: ArrayBuffer): string => {
  const arr = new Uint8Array(buffer);
  let result = '';
  for (let i = 0; i < arr.length; i++) {
    result += String.fromCharCode(arr[i]!);
  }
  return decodeURIComponent(escape(result));
};

// Use P2PCF
const p2pcf = new P2PCF('client-id', 'room-id');

p2pcf.on('msg', (peer: Peer, data: ArrayBuffer) => {
  const message = arrayBufferToText(data);
  console.log('Received:', message);
});

await p2pcf.start();

// Send messages
const data = textToArrayBuffer('Hello!');
p2pcf.broadcast(data);
```

## Dependencies

The implementation uses these npm packages:
- `react-native-webrtc`: WebRTC implementation for React Native
- `base64-arraybuffer`: ArrayBuffer to/from base64 conversion
- `convert-hex`: Hex to bytes conversion
- `array-buffer-to-hex`: ArrayBuffer to hex conversion
- `events`: EventEmitter implementation

No polyfills are needed for `TextEncoder`/`TextDecoder` with our custom implementation.