/// <reference types="vite/client" />

// The shared contract mentions Node's Buffer in a server-only port (Tts). The web build never
// touches it, but the name has to resolve when the contract is type-checked in a DOM context.
interface Buffer extends Uint8Array {}
