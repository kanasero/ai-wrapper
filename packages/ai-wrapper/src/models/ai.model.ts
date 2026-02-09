export interface AIRequest {
  message: string;
  history?: AIMessage[];
  ifUseCache?: boolean;
  model?: string;
}

export enum AIMessageRole {
  user = "user",
  system = "system",
  assistant = "assistant",
}

export interface AIMessage {
  role: AIMessageRole;
  content: string;
}
