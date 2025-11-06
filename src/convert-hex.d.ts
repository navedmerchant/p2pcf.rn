declare module 'convert-hex' {
  export function hexToBytes(hex: string): Uint8Array;
  export function bytesToHex(bytes: Uint8Array): string;
}
