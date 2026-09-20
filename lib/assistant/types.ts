import type { AgentMessage, AgentRun, ChangeRequest } from '@/lib/agent/types'

export interface AssistantThread { id: string; title: string; updated_at: string; deal_id: string | null }
export interface AssistantState {
  thread: AssistantThread
  messages: AgentMessage[]
  proposals: (ChangeRequest & { deal_id: string; deal_title: string; canEdit: boolean })[]
  runs: (AgentRun & { progress: string | null })[]
  hasOlder: boolean
}
export type AssistantEvent = { type: 'progress'; message: string } | { type: 'complete'; state: AssistantState } | { type: 'error'; message: string }
