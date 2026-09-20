import type { Health, Operation } from './schema'

export interface DealContext {
  deal_id: string; objective: string; current_summary: string; health: Health
  blockers: string; current_strategy: string; next_review_date: string | null
  updated_at: string; updated_by: string | null
}
export interface Decision { id: string; content: string; rationale: string; created_at: string; decided_by: string }
export interface Source { id: string; label: string; href: string }
export interface AgentMessage { id: string; role: 'user' | 'assistant'; content: string; created_at: string; sources: Source[]; user_name: string | null; run_id: string }
export interface ChangeRequest { id: string; run_id: string; status: 'pending' | 'applied' | 'rejected'; reason: string; operations: Operation[]; before_state: Record<string, unknown>; base_revision: number; created_at: string; applied_at: string | null }
export interface AgentRun { id: string; status: 'running' | 'completed' | 'failed'; error_message: string | null; created_at: string }
export interface AgentState { context: DealContext | null; decisions: Decision[]; messages: AgentMessage[]; proposals: ChangeRequest[]; runs: AgentRun[]; canEdit: boolean }
