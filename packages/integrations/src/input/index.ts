// Barrel for the rich-input adapters: voice transcription, .ics calendar import,
// and filesystem attachment storage. Each module degrades gracefully so the parent
// can wire routes that always respond, even when an external API or the disk is
// unavailable.

export { transcribeAudio, parseTasksFromTranscript } from './voice';
export { parseIcs, icsToTasks, downloadIcsFromUrl } from './calendar-import';
export type { ParsedEvent } from './calendar-import';
export { saveAttachment, getAttachmentPath, listAttachments, deleteAttachment } from './attachments';
export type { AttachmentRecord } from './attachments';
