/**
 * sanitizeUserInput - Removes or neutralizes common prompt injection and jailbreak patterns from user input.
 * This should be used before sending any user input to the LLM.
 *
 * - Removes common jailbreak tokens (e.g., '###', '---', 'ignore previous', 'system:', 'user:', 'assistant:')
 * - Neutralizes attempts to break out of the prompt or inject instructions
 * - Optionally, can be extended to filter profanity or other unsafe content
 */
export function sanitizeUserInput(input: string): string {
  let sanitized = input;

  // Remove common jailbreak markers and prompt injection attempts
  sanitized = sanitized.replace(/###|---|system:|user:|assistant:|ignore (all|previous|above|instructions)/gi, "");

  // Remove attempts to start new instructions
  sanitized = sanitized.replace(/(\n|^)[ \t]*[\[\(]?system[\]\)]?:?/gi, "");
  sanitized = sanitized.replace(/(\n|^)[ \t]*[\[\(]?user[\]\)]?:?/gi, "");
  sanitized = sanitized.replace(/(\n|^)[ \t]*[\[\(]?assistant[\]\)]?:?/gi, "");

  // Remove excessive whitespace
  sanitized = sanitized.replace(/\s{3,}/g, "  ");

  // Optionally: filter profanity or other unsafe content here

  return sanitized.trim();
}
