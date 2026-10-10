import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/endpoints';
import { dayKey } from '../../lib/time';
import { storage } from '../../lib/util';

export type VoiceState = 'idle' | 'loading' | 'speaking' | 'blocked' | 'done';

export function splitSentences(text: string): string[] {
  return text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+(?=[A-Z0-9“"'(])/u).filter(Boolean);
}

const PREFERRED = [/natural/i, /neural/i, /premium/i, /enhanced/i, /^Samantha/i, /^Ava/i, /^Allison/i, /^Serena/i, /^Daniel/i, /^Karen/i, /Google US English/i, /Google UK English Female/i, /Aria/i, /Jenny/i, /Guy/i];

export function listVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices();
}
export function pickVoice(preferred?: string | null): SpeechSynthesisVoice | null {
  const voices = listVoices();
  if (!voices.length) return null;
  if (preferred) { const v = voices.find((x) => x.name === preferred); if (v) return v; }
  const en = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
  for (const re of PREFERRED) { const v = en.find((x) => re.test(x.name)); if (v) return v; }
  return en.find((v) => v.localService) ?? en[0] ?? voices[0] ?? null;
}
/** Voices load asynchronously in most browsers. */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(listVoices);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const on = () => setVoices(listVoices());
    window.speechSynthesis.addEventListener('voiceschanged', on);
    const t = window.setTimeout(on, 400);
    return () => { window.speechSynthesis.removeEventListener('voiceschanged', on); window.clearTimeout(t); };
  }, []);
  return voices;
}

/** Speak one short sample (used by Settings → "Test voice"). */
export function speakSample(text: string, voiceName?: string | null): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(voiceName);
  if (v) { u.voice = v; u.lang = v.lang; }
  u.rate = 1.02;
  window.speechSynthesis.speak(u);
}

const playedKey = (memberId: string) => `cb.briefing.played.${memberId}`;
export function playedToday(memberId: string): boolean { return storage.get(playedKey(memberId)) === dayKey(Date.now()); }
function markPlayed(memberId: string): void { storage.set(playedKey(memberId), dayKey(Date.now())); }

/**
 * Briefing playback: server TTS audio when available (POST /api/briefing/audio → bytes),
 * otherwise the browser's SpeechSynthesis, one utterance per sentence (robust + gives captions).
 */
export function useBriefingVoice(opts: { memberId: string; text: string | undefined; mode: 'auto' | 'button' | 'off'; voiceName?: string | null }) {
  const { memberId, text, mode, voiceName } = opts;
  const sentences = useMemo(() => (text ? splitSentences(text) : []), [text]);
  const [state, setState] = useState<VoiceState>('idle');
  const [index, setIndex] = useState(-1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const runRef = useRef(0);
  const autoTried = useRef(false);

  const stop = useCallback(() => {
    runRef.current++;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setIndex(-1);
    setState((s) => (s === 'speaking' || s === 'loading' ? 'done' : s));
  }, []);

  const speakBrowser = useCallback((run: number) => {
    if (!('speechSynthesis' in window)) { setState('blocked'); return; }
    const synth = window.speechSynthesis;
    synth.cancel();
    const voice = pickVoice(voiceName);
    let started = false;
    const guard = window.setTimeout(() => { if (!started && runRef.current === run) { synth.cancel(); setState('blocked'); } }, 1800);
    sentences.forEach((s, i) => {
      const u = new SpeechSynthesisUtterance(s);
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      u.rate = 1.02;
      u.pitch = 1;
      u.onstart = () => {
        if (runRef.current !== run) return;
        if (!started) { started = true; window.clearTimeout(guard); markPlayed(memberId); setState('speaking'); }
        setIndex(i);
      };
      u.onend = () => { if (runRef.current === run && i === sentences.length - 1) { setIndex(-1); setState('done'); } };
      u.onerror = (e) => {
        if (runRef.current !== run) return;
        if (e.error === 'not-allowed') { window.clearTimeout(guard); setState('blocked'); }
      };
      synth.speak(u);
    });
  }, [sentences, voiceName, memberId]);

  const play = useCallback(async () => {
    if (!text || !sentences.length) return;
    stop();
    const run = ++runRef.current;
    setState('loading');
    let blob: Blob | null = null;
    try { blob = await api.briefing.audio(text); } catch { blob = null; }
    if (runRef.current !== run) return;
    if (!blob) { speakBrowser(run); return; }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(blob);
    const audio = new Audio(urlRef.current);
    audioRef.current = audio;
    const weights = sentences.map((s) => s.length);
    const total = weights.reduce((a, b) => a + b, 0);
    audio.ontimeupdate = () => {
      if (!audio.duration || runRef.current !== run) return;
      const p = audio.currentTime / audio.duration;
      let acc = 0;
      for (let i = 0; i < weights.length; i++) { acc += weights[i]! / total; if (p <= acc) { setIndex(i); break; } }
    };
    audio.onended = () => { if (runRef.current === run) { setIndex(-1); setState('done'); } };
    try {
      await audio.play();
      markPlayed(memberId);
      setState('speaking');
      setIndex(0);
    } catch {
      if (runRef.current === run) setState('blocked');
    }
  }, [text, sentences, stop, speakBrowser, memberId]);

  // Auto-play once per day (after login the click counts as the user gesture).
  useEffect(() => {
    if (!text || autoTried.current || mode === 'off') return;
    autoTried.current = true;
    if (mode === 'button' || playedToday(memberId)) return;
    let fresh = false;
    try { fresh = sessionStorage.getItem('cb.justLoggedIn') === '1'; sessionStorage.removeItem('cb.justLoggedIn'); } catch { /* ignore */ }
    const activated = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive;
    if (fresh || activated) void play();
    else setState('blocked');
  }, [text, mode, memberId, play]);

  useEffect(() => () => { runRef.current++; if ('speechSynthesis' in window) window.speechSynthesis.cancel(); audioRef.current?.pause(); if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  return { state, index, sentences, play, stop };
}
