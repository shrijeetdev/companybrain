// WhatsApp/phone input that mirrors the server rule (international number with country code,
// stored as +digits) and shows client- or server-side problems inline.
import { useId, useState } from 'react';
import { ApiError } from '../api/client';
import { cx } from '../lib/util';

export const PHONE_HINT = 'Include country code, e.g. +91 98200 11001';

/** null when empty or valid; otherwise a short, fixable reason. Same rule as core `v.phone`. */
export function phoneProblem(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (!/^(\+|00)/.test(s)) return 'Start with + and your country code';
  if (!/^(\+|00)[0-9 ().-]{6,28}$/.test(s)) return 'Use digits, spaces, dashes or brackets only';
  const digits = s.replace(/\D/g, '').replace(/^00/, '');
  if (digits.startsWith('0')) return 'Country codes never start with 0';
  if (digits.length < 8) return 'That number looks too short';
  if (digits.length > 15) return 'That number looks too long';
  return null;
}

/** The server's complaint about a phone field, if that is what an error is about. */
export function phoneServerError(e: unknown): string | null {
  if (!(e instanceof ApiError) || e.status !== 400) return null;
  const issues = (e.details?.issues as { path?: string; message?: string }[] | undefined) ?? [];
  const issue = issues.find((i) => /phone/i.test(i.path ?? ''));
  if (issue) return issue.message ?? e.message;
  return /phone/i.test(e.message) ? e.message : null;
}

export function PhoneField({ id, label = 'WhatsApp number', value, onChange, serverError, hint }: {
  id?: string; label?: string; value: string; onChange: (v: string) => void; serverError?: string | null; hint?: string;
}) {
  const autoId = useId();
  const fid = id ?? autoId;
  const [touched, setTouched] = useState(false);
  const problem = phoneProblem(value);
  const error = (touched && problem) || serverError || null;
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      <input id={fid} className={cx('input', error && 'is-invalid')} value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => setTouched(true)}
        placeholder="+91 98200 11001" inputMode="tel" autoComplete="tel" aria-invalid={!!error} aria-describedby={`${fid}-hint`} />
      <span id={`${fid}-hint`} className={cx('field-hint', error && 'field-error')} role={error ? 'alert' : undefined}>
        {error ? `${error}. ${PHONE_HINT}.` : hint ?? `${PHONE_HINT}.`}
      </span>
    </div>
  );
}
