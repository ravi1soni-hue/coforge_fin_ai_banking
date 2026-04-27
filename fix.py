import sys

file_path = 'src/agent_orchastration_v3/agents/supervisor.agent.ts'
with open(file_path, 'r') as f:
    lines = f.readlines()

start_block = -1
end_block = -1
signature_end = -1

for i, line in enumerate(lines):
    if 'export async function runSupervisorAgent(' in line:
        start_block = i + 1
    if i > start_block and 'conversationHistory: ConversationTurn[] = [],' in line:
        signature_end = i + 2 # Includes '): Promise<AgentPlan> {'

# We want to identify where the block that was accidentally inserted ends.
# It ends right before 'llmClient: V3LlmClient,'
for i in range(start_block, len(lines)):
    if 'llmClient: V3LlmClient,' in lines[i]:
        end_block = i
        break

if start_block != -1 and end_block != -1 and signature_end != -1:
    block = lines[start_block:end_block]
    signature = lines[end_block:signature_end]
    rest = lines[signature_end:]
    
    # New content:
    # 1. Everything before start_block
    # 2. signature
    # 3. Everything between signature_end and line 199 (where sanitizedUserMessage is)
    # 4. the block
    # 5. rest
    
    # Actually simpler:
    # Just swap the signature and the misplaced block.
    
    new_lines = lines[:start_block] + signature + block + rest
    with open(file_path, 'w') as f:
        f.writelines(new_lines)
    print("Successfully rearranged the code.")
else:
    print(f"Failed to find blocks: start={start_block}, end={end_block}, sig={signature_end}")
