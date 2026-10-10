import { useQuery, useQueryClient } from '@tanstack/react-query';
import { m } from 'motion/react';
import { Check, Crown, Frame, Lock, Package, Smile } from 'lucide-react';
import { useState } from 'react';
import type { Crate, InventoryItem } from '@companybrain/types';
import { errorMessage } from '../api/client';
import { api } from '../api/endpoints';
import { qk, useHud, useMe } from '../api/queries';
import { Avatar } from '../components/Avatar';
import { Bar, Empty, Segmented, Skeleton } from '../components/ui';
import { CrateArt, CrateOpener } from '../features/game/Crate';
import { HudHero } from '../features/game/Hud';
import { useLabels } from '../lib/labels';
import { sfx } from '../lib/sfx';
import { ago } from '../lib/time';
import { toast } from '../lib/toast';
import { cx } from '../lib/util';

export function Armory() {
  const L = useLabels();
  const [tab, setTab] = useState<'crates' | 'loadout' | 'medals'>('crates');
  const { data: hud } = useHud();
  return (
    <>
      <div className="page-head">
        <div><h1>{L.armory}</h1><div className="sub">Crates, cosmetics and {L.achievements.toLowerCase()} you’ve earned by shipping.</div></div>
        <div className="actions"><Segmented label="Section" value={tab} onChange={setTab} options={[{ value: 'crates', label: L.crates }, { value: 'loadout', label: 'Loadout' }, { value: 'medals', label: L.achievements }]} /></div>
      </div>
      {hud && <div style={{ marginBottom: 14 }}><HudHero hud={hud} /></div>}
      {tab === 'crates' && <Crates />}
      {tab === 'loadout' && <Loadout />}
      {tab === 'medals' && <Medals />}
    </>
  );
}

function Crates() {
  const L = useLabels();
  const { data, isLoading } = useQuery({ queryKey: qk.game.crates, queryFn: api.game.crates });
  const [opening, setOpening] = useState<Crate | null>(null);
  const sorted = [...(data ?? [])].sort((a, b) => Number(!!a.openedAt) - Number(!!b.openedAt) || b.earnedAt - a.earnedAt);
  return (
    <>
      <div className="crate-grid">
        {isLoading && Array.from({ length: 4 }, (_, i) => <div key={i} className="panel panel-pad"><Skeleton h={140} /></div>)}
        {sorted.map((c, i) => (
          <m.button key={c.id} className={cx('panel crate-card', `rarity-${c.rarity}`, c.openedAt && 'opened')} onClick={() => setOpening(c)}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: c.openedAt ? 0.75 : 1, y: 0 }} transition={{ delay: i * 0.04 }} whileHover={c.openedAt ? undefined : { rotate: [0, -2, 2, 0] }}>
            <CrateArt rarity={c.rarity} open={!!c.openedAt} />
            <span className="rarity-label">{c.rarity}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>{c.openedAt ? c.reward?.name ?? 'Opened' : c.source}</span>
            <span className="faint" style={{ fontSize: 11.5 }}>{c.openedAt ? `opened ${ago(c.openedAt)}` : `earned ${ago(c.earnedAt)}`}</span>
            {!c.openedAt && <span className="btn btn-primary btn-sm" style={{ marginTop: 4 }}><Package /> Open</span>}
          </m.button>
        ))}
      </div>
      {data?.length === 0 && <div className="panel"><Empty art="📦" title={`No ${L.crates.toLowerCase()} yet`}>Complete {L.tasksLower}, keep your streak and level up to earn them.</Empty></div>}
      <CrateOpener crate={opening} onClose={() => setOpening(null)} />
    </>
  );
}

function Loadout() {
  const qc = useQueryClient();
  const me = useMe();
  const { data: inv } = useQuery({ queryKey: qk.game.inventory, queryFn: api.game.inventory });
  const { data: profile } = useQuery({ queryKey: qk.game.profile(me.id), queryFn: () => api.game.profile() });
  const equip = async (it: InventoryItem) => {
    const on = it.kind === 'title' ? profile?.equipped.title === it.name : it.kind === 'frame' ? profile?.equipped.frame === it.id : profile?.equipped.emote === it.name;
    const patch = it.kind === 'title' ? { title: on ? null : it.name } : it.kind === 'frame' ? { frame: on ? null : it.id } : { emote: on ? null : it.name };
    try {
      const p = await api.game.equip(patch);
      qc.setQueryData(qk.game.profile(me.id), p);
      void qc.invalidateQueries({ queryKey: qk.game.hud });
      sfx.tick();
      toast.success(on ? 'Unequipped' : `Equipped ${it.name}`);
    } catch (e) { toast.error(errorMessage(e)); }
  };
  const groups: { kind: InventoryItem['kind']; label: string; icon: React.ReactNode }[] = [
    { kind: 'title', label: 'Titles', icon: <Crown size={16} /> }, { kind: 'frame', label: 'Avatar frames', icon: <Frame size={16} /> }, { kind: 'emote', label: 'Emotes', icon: <Smile size={16} /> },
  ];
  return (
    <div className="stack" style={{ gap: 18 }}>
      {groups.map((g) => {
        const items = (inv ?? []).filter((i) => i.kind === g.kind);
        return (
          <section key={g.kind}>
            <div className="section-title" style={{ marginBottom: 10 }}>{g.icon} {g.label}</div>
            {items.length === 0 ? <div className="faint" style={{ fontSize: 13 }}>None yet — open crates to find some.</div> : (
              <div className="inv-grid">
                {items.map((it) => {
                  const on = it.kind === 'title' ? profile?.equipped.title === it.name : it.kind === 'frame' ? profile?.equipped.frame === it.id : profile?.equipped.emote === it.name;
                  return (
                    <button key={it.id} className={cx('inv-item', `rarity-${it.rarity}`, on && 'equipped')} onClick={() => void equip(it)} aria-pressed={on}>
                      {it.kind === 'frame' ? <Avatar member={me} size={40} frame={it.id} /> : <span className="inv-swatch">{it.kind === 'title' ? <Crown size={18} /> : it.name.split(' ')[0]}</span>}
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="truncate" style={{ fontWeight: 650, fontSize: 13.5 }}>{it.kind === 'emote' ? it.name.split(' ').slice(1).join(' ') : it.name}</div>
                        <div className="rarity-label" style={{ fontSize: 10 }}>{it.rarity}</div>
                      </div>
                      {on && <span className="chip tone-success" style={{ height: 22 }}><Check /> Equipped</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Medals() {
  const me = useMe();
  const { data } = useQuery({ queryKey: qk.game.achievements(me.id), queryFn: () => api.game.achievements() });
  const unlocked = (data ?? []).filter((a) => a.unlockedAt).length;
  return (
    <>
      <div className="faint" style={{ fontSize: 13, margin: '0 4px 12px' }}>{unlocked} of {data?.length ?? 0} unlocked</div>
      <div className="medal-grid">
        {(data ?? []).map((a, i) => {
          const locked = !a.unlockedAt;
          const secret = a.achievement.secret && locked;
          return (
            <m.div key={a.achievement.id} className={cx('panel medal', `tier-${a.achievement.tier}`, locked && 'locked', secret && 'secret')}
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}>
              <span className="medal-icon">{secret ? <Lock size={24} /> : a.achievement.icon}</span>
              <span className="medal-name">{secret ? 'Classified' : a.achievement.name}</span>
              <span className="medal-desc">{secret ? 'Keep playing to reveal this one.' : a.achievement.description}</span>
              {locked && !secret && <><Bar pct={(a.progress / a.achievement.target) * 100} height={4} /><span className="faint num" style={{ fontSize: 11 }}>{a.progress}/{a.achievement.target}</span></>}
              {!locked && <span className="faint" style={{ fontSize: 11 }}>Unlocked {ago(a.unlockedAt!)}</span>}
            </m.div>
          );
        })}
      </div>
    </>
  );
}
