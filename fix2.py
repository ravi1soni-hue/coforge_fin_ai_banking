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
        # Scan forward for the closing braces of the block
        for j in range(i, len(lines)):
            if '}' in lines[j]:
                # It's actually three closing braces: if (lastMajor), if (isConfirmation), and then the end of block
                # Looking at the code, line 198 is the last '}' of the block
                if '}' in lines[j] and j+1 < len(lines) and 'const sanitizedUserMessage' in lines[j+1]:
                    block_end = j + 1
                    break
        break

for i, line in enumerate(lines):
    if 'const messages: AgenticMessage[] = [' in line:
        target_line = i
        break

if block_start != -1 and block_end != -1 and target_line != -1:
    block = lines[block_start:block_end]
    rest_before = lines[:block_start]
    rest_after = lines[block_end:target_line]
    rest_final = lines[target_line:]
    
    new_lines = rest_before + rest_after + block + rest_final
    with open(file_path, 'w') as f:
        f.writelines(new_lines)
    print("Successfully moved the block lower.")
else:
    print(f"Failed to find indices: start={block_start}, end={block_end}, target={target_line}")
