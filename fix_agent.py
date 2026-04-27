import sys

with open('src/agent_orchastration_v3/agents/supervisor.agent.ts', 'r') as f:
    lines = f.readlines()

# We want to remove lines 146 to 193 (0-indexed 145 to 192)
# and keep the ones after.

new_lines = lines[:145] + lines[193:]

# Now we need to move the logic inside the function.
# The function starts at the new line 145 (originally 194).
# We want to insert the logic after:
#   const homeCurrency = String(userProfile?.homeCurrency ?? "GBP");
# which is around line 150 in the new file.

insert_idx = -1
for i, line in enumerate(new_lines):
    if 'const homeCurrency = String(userProfile?.homeCurrency ?? "GBP");' in line:
        insert_idx = i + 1
        break

if insert_idx != -1:
    logic = [
        '  const confirmationPhrases = [\n',
        '    "yes", "let\'s go", "lets go", "sure", "okay", "ok", "sounds good", "do it", "go ahead", "confirm", "please help", "help me", "3 month plan", "6 month plan", "installment", "spread it", "that works", "continue", "next"\n',
        '  ];\n',
        '  const isConfirmation = confirmationPhrases.some(phrase => sanitizedUserMessage.toLowerCase().includes(phrase));\n',
        '  if (isConfirmation && conversationHistory.length > 0) {\n',
        '    const lastMajor = [...conversationHistory].reverse().find(m => m.role === "user" && !confirmationPhrases.some(p => m.content.toLowerCase().includes(p)));\n',
        '    if (lastMajor) {\n',
        '      console.log("[SupervisorAgent] Detected confirmation/follow-up. Biasing intent to last major topic.");\n',
        '      // Interleave last turns for context\n',
        '      const lastTurnsLT: { role: string; content: string }[] = [];\n',
        '      const userTurnsLT = conversationHistory.filter(m => m.role === "user");\n',
        '      const assistantTurnsLT = conversationHistory.filter(m => m.role === "assistant");\n',
        '      const lastUserLT = userTurnsLT.slice(-2);\n',
        '      const lastAssistantLT = assistantTurnsLT.slice(-1);\n',
        '      if (lastUserLT.length > 0) lastTurnsLT.push({ role: "user", content: lastUserLT[0].content });\n',
        '      if (lastAssistantLT.length > 0) lastTurnsLT.push({ role: "assistant", content: lastAssistantLT[0].content });\n',
        '      if (lastUserLT.length > 1) lastTurnsLT.push({ role: "user", content: lastUserLT[1].content });\n',
        '      const historyTextLT = "\\n\\nRecent conversation (most recent last):\\n" + lastTurnsLT.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 300)}`).join("\\n");\n',
        '      const messagesLT: AgenticMessage[] = [\n',
        '        { role: "system", content: SYSTEM_PROMPT },\n',
        '        { role: "user", content: `User\'s home currency: ${homeCurrency}${historyTextLT}\\n\\nCurrent message: "${sanitizedUserMessage}"` },\n',
        '      ];\n',
        '      let parsed: Record<string, unknown> | null = null;\n',
        '      try {\n',
        '        parsed = await llmClient.chatJSON<Record<string, unknown>>(messagesLT);\n',
        '      } catch (e) {\n',
        '        console.warn("[SupervisorAgent] Could not parse LLM plan, using default.", e);\n',
        '      }\n',
        '      if (parsed) {\n',
        '        let planIntent = (parsed.intent as any) || "other";\n',
        '        if (planIntent === "subscription") {\n',
        '          const lastIntentMatch = /affordability|balance|investment|loan|credit|summary|trip|travel|purchase|spend|save|plan|installment/i.exec(lastMajor.content);\n',
        '          if (lastIntentMatch) {\n',
        '            planIntent = lastIntentMatch[0].toLowerCase();\n',
        '            console.log("[SupervisorAgent] Overriding subscription intent with:", planIntent);\n',
        '          }\n',
        '        }\n',
        '        const plan: AgentPlan = {\n',
        '          needsWebSearch:     Boolean(parsed.needsWebSearch),\n',
        '          needsFxConversion:  Boolean(parsed.needsFxConversion),\n',
        '          needsNews:          Boolean(parsed.needsNews),\n',
        '          needsAffordability: Boolean(parsed.needsAffordability),\n',
        '          needsEmi:           Boolean(parsed.needsEmi),\n',
        '          conversationalOnly: Boolean(parsed.conversationalOnly),\n',
        '          product:            (parsed.product as string)        || undefined,\n',
        '          searchQuery:        (parsed.searchQuery as string)    || undefined,\n',
        '          priceCurrency:      (parsed.priceCurrency as string)  || undefined,\n',
        '          targetCurrency:     (parsed.targetCurrency as string) || undefined,\n',
        '          userHomeCurrency:   (parsed.userHomeCurrency as string) || homeCurrency,\n',
        '          userStatedPrice:    Number(parsed.userStatedPrice)    || 0,\n',
        '          intent:             planIntent,\n',
        '          dbWakingUp:         Boolean(parsed.dbWakingUp),\n',
        '          fallbackIntent:     Boolean(parsed.fallbackIntent),\n',
        '        };\n',
        '        console.log("[SupervisorAgent] LLM plan (confirmation/follow-up):", plan);\n',
        '        return plan;\n',
        '      }\n',
        '    }\n',
        '  }\n'
    ]
    new_lines[insert_idx:insert_idx] = logic

with open('src/agent_orchastration_v3/agents/supervisor.agent.ts', 'w') as f:
    f.writelines(new_lines)
