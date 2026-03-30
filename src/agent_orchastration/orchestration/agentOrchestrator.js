import { ConversationState } from "../models/conversationState.model";
import { ConversationStage } from "./conversationStages";

export class AgentOrchestrator {
    constructor({
      intentAgent,
      plannerAgent,
      financeAgent,
      researchAgent,
      reasoningAgent,
      synthesisAgent,
    }) {
      this.intentAgent = intentAgent;
      this.plannerAgent = plannerAgent;
      this.financeAgent = financeAgent;
      this.researchAgent = researchAgent;
      this.reasoningAgent = reasoningAgent;
      this.synthesisAgent = synthesisAgent;
    }
  
    

/**
 * @param {ConversationState} state
 * @returns {Promise<{ type: string, message?: string }>}
 */
    async handleQuestion(state) {
      // 1️⃣ Intent
      const intentResult = await this.intentAgent.run(state);
      state.update(intentResult);
      state.stage = ConversationStage.PLANNING;
  
      // 2️⃣ Planner
      const plan = await this.plannerAgent.run(state);
      state.collectedData.plan = plan;
  
      // 3️⃣ Missing info?
      if (plan.missingFacts?.length) {
        state.missingFacts = plan.missingFacts;
        return {
          type: "question",
          message: this.synthesisAgent.askFollowUp(plan.missingFacts),
        };
      }
  
      // 4️⃣ Finance data (RAG)
      const finance = await this.financeAgent.run(state);
      state.collectedData.finance = finance;
  
      // 5️⃣ Research data
      const research = await this.researchAgent.run(state);
      state.collectedData.research = research;
  
      // 6️⃣ Reasoning
      const reasoning = await this.reasoningAgent.run(state);
      state.collectedData.reasoning = reasoning;
  
      // 7️⃣ Final synthesis
      return this.synthesisAgent.run(state);
    }
  }