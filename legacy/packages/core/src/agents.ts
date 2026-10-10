import type { Autonomy } from '@companybrain/types';

/** The AI workforce roster shown in the "AI Agents" role view. Matches the prototype. */
export interface AgentProfile {
  id: string;
  name: string;
  emoji: string;
  role: string;
  autonomy: Autonomy;
  done: number;
  pending: number;
}

export const AGENT_ROSTER: AgentProfile[] = [
  { id: 'agent_scout', name: 'Scout', emoji: '🔭', role: 'Watches channels, captures loops', autonomy: 'auto', done: 142, pending: 3 },
  { id: 'agent_atlas', name: 'Atlas', emoji: '🗺️', role: 'Plans projects, breaks down tasks', autonomy: 'ask', done: 38, pending: 1 },
  { id: 'agent_ledger', name: 'Ledger', emoji: '📒', role: 'Chases leads, drafts follow-ups', autonomy: 'ask', done: 64, pending: 5 },
];

export function makeAgents() {
  return {
    roster(): AgentProfile[] {
      return AGENT_ROSTER;
    },
  };
}

export type AgentService = ReturnType<typeof makeAgents>;
