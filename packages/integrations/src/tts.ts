// Optional server-side text-to-speech: OpenAI /v1/audio/speech or ElevenLabs. mp3 output.

import type { Tts } from '@companybrain/types';
import type { IntegrationsConfig } from './config';
import { defaultLogger, errMsg, fetchWithTimeout, safeText, type FetchLike, type Logger } from './util';

const MAX_CHARS = 4000;

export function createTts(cfg: IntegrationsConfig, deps: { fetch?: FetchLike; log?: Logger } = {}): Tts | null {
  const tts = cfg.tts;
  if (!tts) return null;
  const log = deps.log ?? defaultLogger;
  const f = deps.fetch ?? fetch;

  return {
    async synthesize(text, opts) {
      const input = (text ?? '').trim().slice(0, MAX_CHARS);
      if (!input) return null;
      try {
        let res: Response;
        if (tts.provider === 'openai') {
          res = await fetchWithTimeout(
            f,
            `${tts.baseUrl}/audio/speech`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${tts.apiKey}`, 'content-type': 'application/json' },
              body: JSON.stringify({ model: tts.model, voice: opts?.voice || tts.voice, input, response_format: 'mp3' }),
            },
            20_000,
          );
        } else {
          const voiceId = encodeURIComponent(opts?.voice || tts.voiceId);
          res = await fetchWithTimeout(
            f,
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
            {
              method: 'POST',
              headers: { 'xi-api-key': tts.apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
              body: JSON.stringify({ text: input, model_id: tts.model }),
            },
            20_000,
          );
        }
        if (!res.ok) {
          log.warn(`tts: ${tts.provider} HTTP ${res.status} ${await safeText(res)}`);
          return null;
        }
        const audio = Buffer.from(await res.arrayBuffer());
        if (audio.length === 0) return null;
        return { audio, mime: 'audio/mpeg' };
      } catch (e) {
        log.warn(`tts: ${tts.provider} failed:`, errMsg(e));
        return null;
      }
    },
  };
}
