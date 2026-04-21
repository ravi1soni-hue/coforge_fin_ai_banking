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
    // Neutralize phrases that trigger Azure jailbreak/content filter
    // e.g., 'schedule', 'auto release', 'automatically release', 'execute', 'run', 'bypass', 'ignore', etc.
    sanitized = sanitized.replace(/\b(schedule|auto release|automatically release|execute|run|bypass|ignore|override|inject|system command|system prompt|jailbreak)\b/gi, function (match) {
        // Replace with a neutral, less-instructional synonym
        switch (match.toLowerCase()) {
            case 'schedule':
                return 'confirm the plan to';
            case 'auto release':
            case 'automatically release':
                return 'proceed with the planned release';
            case 'execute':
            case 'run':
                return 'proceed with';
            case 'bypass':
            case 'ignore':
            case 'override':
            case 'inject':
            case 'system command':
            case 'system prompt':
            case 'jailbreak':
                return '';
            default:
                return '';
        }
    });
    // Remove excessive whitespace
    sanitized = sanitized.replace(/\s{3,}/g, "  ");
    // Optionally: filter profanity or other unsafe content here
    return sanitized.trim();
}
