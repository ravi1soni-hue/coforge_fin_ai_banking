import { ConversationState } from "../models/conversationState.model.js";

export class ConversationStateManager {
  create(userId, question) {
    return new ConversationState({ userId, question });
  }
}