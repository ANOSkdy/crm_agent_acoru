export class AgentError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
