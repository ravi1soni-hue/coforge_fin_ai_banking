/**
 * sanitizeUserInput - Removes or neutralizes common prompt injection and jailbreak patterns from user input.
 * This should be used before sending any user input to the LLM.
 *
 * - Removes common jailbreak tokens (e.g., '###', '---', 'ignore previous', 'system:', 'user:', 'assistant:')
 * - Neutralizes attempts to break out of the prompt or inject instructions
 * - Optionally, can be extended to filter profanity or other unsafe content
 */
export function sanitizeUserInput(input) {
    let sanitized = input;
    // Remove common jailbreak markers and prompt injection attempts
    sanitized = sanitized.replace(/###|---|system:|user:|assistant:|ignore (all|previous|above|instructions)/gi, "");
    // Remove attempts to start new instructions
    sanitized = sanitized.replace(/(\n|^)[ \t]*[\[\(]?system[\]\)]?:?/gi, "");
    sanitized = sanitized.replace(/(\n|^)[ \t]*[\[\(]?user[\]\)]?:?/gi, "");
    sanitized = sanitized.replace(/(\n|^)[ \t]*[\[\(]?assistant[\]\)]?:?/gi, "");
    // Generic: Neutralize imperative/instructional language (simple heuristic)
    // Convert sentences starting with a verb (imperative) to passive/neutral form
    sanitized = sanitized.replace(/^(please |kindly |can you |could you |would you |should you |let's |lets |let us |try to |attempt to |make sure to |ensure to |go ahead and |now |then |next |start by |begin by |proceed to |proceed with |do |make |schedule |release |send |run |execute |trigger |initiate |bypass |ignore |override |inject |force |system command |system prompt |jailbreak)\b/gi, function (match) {
        return "The plan is to";
    });
    // Convert direct commands to neutral statements (e.g., "Release payment" -> "The plan is to release the payment")
    sanitized = sanitized.replace(/^(\w+)( .*)?$/gm, function (line) {
        // If line starts with a verb and is short, rephrase
        if (/^(release|send|schedule|run|execute|trigger|initiate|bypass|ignore|override|inject|force)\b/i.test(line)) {
            return "The plan is to " + line.charAt(0).toLowerCase() + line.slice(1);
        }
        return line;
    });
    // Remove excessive whitespace
    sanitized = sanitized.replace(/\s{3,}/g, "  ");
    // Fallback: If still contains suspicious patterns, replace with a generic safe message
    if (/(schedule|auto release|automatically release|execute|run|bypass|ignore|override|inject|system command|system prompt|jailbreak|do this|make this|force|trigger)/i.test(sanitized)) {
        sanitized = "The plan is to proceed with the requested action at the appropriate time, as per policy.";
    }
    return sanitized.trim();
}
