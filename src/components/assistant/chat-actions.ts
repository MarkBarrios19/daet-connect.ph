/**
 * What the chat header's "⋯" menu can do to the conversation. AssistantChat
 * keeps `actionsRef.current` up to date; the header reads it when the menu opens.
 */
export type ChatActions = {
  hasMessages: boolean;
  /** Signed-in chats are kept in the account, so starting over deletes them and needs a confirmation. */
  savedOnServer: boolean;
  /** At least one finished reply: "Send feedback" jumps to its "Was this helpful?" buttons. */
  canGiveFeedback: boolean;
  newChat: () => void;
  deleteHistory: () => Promise<void>;
  feedback: () => void;
};
