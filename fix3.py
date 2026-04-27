import sys

file_path = 'src/agent_orchastration_v3/agents/supervisor.agent.ts'
with open(file_path, 'r') as f:
    lines = f.readlines()

block_start = -1
block_end = -1
target_line = -1

for i, line in enumerate(lines):
    if '// Fallback: If user message is a short confirmation/plan selection' in line:
        block_start = i
    if i > block_start and block_start != -1 and 'return plan;' in line:
        for j in range(i, len(lines)):
            if '}' in lines[j] and j+1 < len(lines) and 'const messages' in lines[j+1]:
                block_end = j + 1
                break
        break

for i, line in enumerate(lines):
    if 'console.log("[SupervisorAgent] Calling LLM to classify query...");' in line:
        target_line = i
        break

if block_start != -1 and block_end != -1 and target_line != -1:
    block = lines[block_start:block_end]
    # We must remove the block from its current position and insert it AFTER target_line
    # Actually, current position is between historyText and messages.
    # New position should be after messages.
    
    new_lines = lines[:block_start] + lines[block_end:target_line+1] + block + lines[target_line+1:]
    with open(file_path, 'w') as f:
        f.writelines(new_lines)
    print("Successfully moved the block after messages.")
else:
    print(f"Failed to find indices: start={block_start}, end={block_end}, target={target_line}")
