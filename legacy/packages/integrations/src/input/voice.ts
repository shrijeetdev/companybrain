// Voice transcription for rich task input. Speech → text → task titles.
//
// Mirrors the llm.ts philosophy: works with zero config (no OPENAI_API_KEY → empty
// transcript + a console warning) and NEVER throws — voice is an enhancement, not a
// hard requirement, so a missing/broken API key degrades to silence rather than
// breaking task creation.

import { randomUUID } from 'node:crypto';

const OPENAI_AUDIO_URL = 'https://api.openai.com/v1/audio/transcriptions';

/**
 * Transcribe an audio buffer via the OpenAI Whisper API.
 *
 * Returns the raw transcribed text. When no OPENAI_API_KEY is configured, or the
 * call fails for any reason, it returns '' and logs a warning — callers can treat
 * voice as a best-effort signal.
 *
 * @param audioBuffer raw audio bytes (mp3/wav/m4a/webm… — anything Whisper accepts)
 * @param mimeType    optional mime type, used to name the uploaded file sensibly
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType?: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[voice] OPENAI_API_KEY not set — transcription disabled, returning empty text');
    return '';
  }

  // Whisper infers format from the extension. Pick one from the mime type so odd
  // containers still parse; default to .mp3 which is the safest universal choice.
  const ext = mimeToExtension(mimeType, 'mp3');

  const form = new FormData();
  form.append('model', 'whisper-1');
  // Blob accepts a Buffer as its source; the filename via the Blob options is what
  // OpenAI uses to detect the audio container format.
  form.append('file', new Blob([new Uint8Array(audioBuffer)], { type: mimeType ?? 'audio/mpeg' }), `audio.${ext}`);

  try {
    const response = await fetch(OPENAI_AUDIO_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const detail = await safeReadText(response);
      console.warn(`[voice] Whisper API returned ${response.status}: ${detail}`);
      return '';
    }

    const data = (await response.json()) as { text?: string };
    return data.text?.trim() ?? '';
  } catch (err) {
    // Network blip, DNS failure, malformed response — never let voice break the flow.
    console.warn('[voice] transcription failed, returning empty text:', err);
    return '';
  }
}

/**
 * Pull action items out of spoken text using lightweight heuristics.
 *
 * People say things like "remind me to…", "add a task to…", "I need to…", or
 * explicitly flag "todo: …". We split on sentence/clause boundaries and keep any
 * fragment that begins with a task cue. Returns zero or more task titles.
 */
export function parseTasksFromTranscript(text: string): string[] {
  if (!text) return [];

  const normalised = text.replace(/\s+/g, ' ').trim();

  // Cues that introduce an action item, case-insensitive. Kept loose on purpose:
  // speech is messy, so we match anywhere in a clause, then trim the cue itself.
  const cuePattern =
    /\b(?:remind me to|add (?:a )?task(?: to)?|i need to|todo\s*:|to-do\s*:|don't forget to|make sure (?:to|i))\b/gi;

  // Split into candidate clauses: sentence terminators, "and then", commas followed
  // by a cue, or newlines. This is deliberately rough — over-segmenting is fine
  // because each piece is re-checked against the cue pattern.
  const clauses = normalised
    .split(/(?:[.!?]\s+|\band then\b|\n+|(?:,\s*)(?=\b(?:remind|add|i need|todo|to-do|don't|make sure)\b))/i)
    .map((c) => c.trim())
    .filter(Boolean);

  const titles: string[] = [];
  for (const clause of clauses) {
    const match = cuePattern.exec(clause);
    if (!match) continue;
    // Strip the cue itself and tidy up casing/punctuation.
    let title = clause.slice(match.index + match[0].length).trim();
    title = title.replace(/^[\s,;:.\-–—]+/, '').trim();
    title = title.replace(/[\s,;:]+$/, '');
    // Capitalise the first letter so titles read like a real task.
    if (title) titles.push(title.charAt(0).toUpperCase() + title.slice(1));
    cuePattern.lastIndex = 0;
  }

  // Dedupe while preserving spoken order.
  return [...new Set(titles)];
}

/** Map a mime type to a file extension for the Whisper upload. Defaults to `fallback`. */
function mimeToExtension(mime: string | undefined, fallback: string): string {
  if (!mime) return fallback;
  const map: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/wave': 'wav',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/flac': 'flac',
  };
  // Strip parameters like "; codecs=opus" before looking up.
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? mime.trim().toLowerCase();
  return map[base] ?? fallback;
}

/** Read response text without throwing when the body is malformed. */
async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '<unreadable response body>';
  }
}

// Exported so the parent layer can mint ids consistently with the rest of the app
// if it wants; not part of the documented surface but harmless.
export const _newId = (): string => randomUUID().slice(0, 12);
