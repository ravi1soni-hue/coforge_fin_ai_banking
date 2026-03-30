import { ConversationStage } from "../orchestration/conversationStages";

export class ConversationState {
    constructor({ userId, question }) {
      this.userId = userId;
      this.originalQuestion = question;
  
      this.goal = null;
      this.stage = ConversationStage.INTENT;
      this.knownFacts = {};
      this.missingFacts = [];
      this.collectedData = {};
      this.assumptions = [];
      this.history = [];
  
      this.createdAt = new Date();
      this.updatedAt = new Date();
    }
  
    update(patch = {}) {
      Object.assign(this, patch);
      this.updatedAt = new Date();
    }

    
setStage(stage) {
  if (!Object.values(ConversationStage).includes(stage)) {
    throw new Error(`Invalid conversation stage: ${stage}`);
  }
  this.stage = stage;
  this.updatedAt = new Date();
}

  
    addHistory(entry) {
      this.history.push({
        ...entry,
        at: new Date(),
      });
    }
  }