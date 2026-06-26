export type { InboundMessage } from './pipeline';
export { ingest, needsHuman } from './pipeline';
export { createMessenger, type MessengerConfig } from './messenger';
export { createBaileysChannel, type BaileysChannel } from './whatsapp/baileys';
export * as whatsapp from './whatsapp/cloud-api';
