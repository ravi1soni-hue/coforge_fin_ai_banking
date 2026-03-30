

export function splitTextByLines(text: String, linesPerChunk = 10) {
    const lines = text.split(/\r?\n/);
    const chunks = [];
  
    for (let i = 0; i < lines.length; i += linesPerChunk) {
      const chunk = lines.slice(i, i + linesPerChunk).join('\n');
      chunks.push(chunk);
    }
  
    return chunks;
  }