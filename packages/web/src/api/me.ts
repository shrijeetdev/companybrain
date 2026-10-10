import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { MemberPrefs, UpdateMemberInput } from '@companybrain/types';
import { setSoundPref } from '../lib/sfx';
import { setTheme } from '../lib/theme';
import { toast } from '../lib/toast';
import { errorMessage } from './client';
import { api, type AuthState } from './endpoints';
import { qk } from './queries';

/** Update the signed-in member (optimistic), keeping theme/sound side effects in sync. */
export function useUpdateMe() {
  const qc = useQueryClient();
  /** `onError` may handle the error itself (e.g. inline under a field); return true to skip the toast. */
  return useCallback(async (patch: UpdateMemberInput & { prefs?: Partial<MemberPrefs> }, opts: { onError?: (e: unknown) => boolean } = {}) => {
    const prev = qc.getQueryData<AuthState>(qk.auth);
    if (prev?.member) {
      qc.setQueryData<AuthState>(qk.auth, { ...prev, member: { ...prev.member, ...patch, prefs: { ...prev.member.prefs, ...(patch.prefs ?? {}) } } as AuthState['member'] });
    }
    if (patch.prefs?.theme) setTheme(patch.prefs.theme);
    if (patch.prefs?.sound !== undefined) setSoundPref(patch.prefs.sound);
    try {
      const m = await api.me.update(patch);
      qc.setQueryData<AuthState>(qk.auth, (s) => (s ? { ...s, member: m } : s));
      void qc.invalidateQueries({ queryKey: qk.members });
      if (patch.prefs?.theme) void qc.invalidateQueries({ queryKey: qk.briefing });
      return m;
    } catch (e) {
      if (prev) qc.setQueryData(qk.auth, prev);
      if (prev?.member && patch.prefs?.theme) setTheme(prev.member.prefs.theme ?? 'tactical');
      if (!opts.onError?.(e)) toast.error(errorMessage(e));
      return null;
    }
  }, [qc]);
}

export function useLogout() {
  const qc = useQueryClient();
  return useCallback(async () => {
    try { await api.auth.logout(); } catch { /* ignore */ }
    qc.clear();
    window.location.assign('/');
  }, [qc]);
}
