export interface DocChunk {
  id: string;
  docId: string;
  heading: string;
  content: string;
  chunkIndex: number;
}

/**
 * Phân đoạn tài liệu Markdown theo các đề mục H1, H2, H3 để nạp vào Vectorize/D1
 */
export function chunkMarkdown(docId: string, markdown: string): DocChunk[] {
  const lines = markdown.split("\n");
  const chunks: DocChunk[] = [];

  let currentHeading = "Giới thiệu chung";
  let currentLines: string[] = [];
  let chunkIndex = 0;

  for (const line of lines) {
    // Kiểm tra dòng tiêu đề Markdown (# , ## , ### )
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      if (currentLines.length > 0) {
        const text = currentLines.join("\n").trim();
        if (text.length > 50) {
          chunks.push({
            id: `${docId}#chunk-${chunkIndex}`,
            docId,
            heading: currentHeading,
            content: `[Tài liệu: ${docId} | Đề mục: ${currentHeading}]\n${text}`,
            chunkIndex,
          });
          chunkIndex++;
        }
        currentLines = [];
      }
      currentHeading = headingMatch[2].trim();
    } else {
      currentLines.push(line);
    }
  }

  // Đoạn cuối cùng
  if (currentLines.length > 0) {
    const text = currentLines.join("\n").trim();
    if (text.length > 20) {
      chunks.push({
        id: `${docId}#chunk-${chunkIndex}`,
        docId,
        heading: currentHeading,
        content: `[Tài liệu: ${docId} | Đề mục: ${currentHeading}]\n${text}`,
        chunkIndex,
      });
    }
  }

  return chunks;
}
