import { AgentRunnerOptions, AgentRunnerResult, ToolTraceItem } from "./types";

export class AgentRunner {
  /**
   * Dọn sạch các dòng hallucinate giả lập tool call từ LLM
   */
  static cleanHallucinations(text: string): string {
    return (text || "")
      .replace(/Gọi tool:[\s\S]*?(?=\n\n|$)/gi, "")
      .replace(/search_codebase\([\s\S]*?\)/gi, "")
      .replace(/read_code_file\([\s\S]*?\)/gi, "")
      .replace(/list_repository_files\([\s\S]*?\)/gi, "")
      .replace(/```(?:json)?\s*\{\s*"query"[\s\S]*?\}\s*```/gi, "")
      .replace(/\{"query":\s*"[^"]*",\s*"repo":\s*"[^"]*"\}/gi, "")
      .trim();
  }

  /**
   * Thực thi vòng lặp ReAct / Multi-turn
   */
  static async run(options: AgentRunnerOptions): Promise<AgentRunnerResult> {
    const {
      aiClient,
      contents,
      systemInstruction,
      tools,
      toolDispatcher,
    } = options;

    const hasTools = Boolean(tools && tools.length > 0 && toolDispatcher);
    const maxTurns = hasTools ? (options.maxTurns ?? 2) : 1;
    let currentTurn = 0;
    let responseText = "";
    const toolTrace: ToolTraceItem[] = [];
    let lastAiResponse: any = null;

    const activeToolsDeclaration = hasTools ? [{ functionDeclarations: tools! }] : undefined;

    while (currentTurn < maxTurns) {
      currentTurn++;
      const isFinalTurn = currentTurn === maxTurns;
      const activeTools = isFinalTurn ? undefined : activeToolsDeclaration;

      let turnInstruction = systemInstruction;
      if (!activeTools) {
        turnInstruction +=
          "\n\nLƯU Ý QUAN TRỌNG: Hiện tại bạn KHÔNG có công cụ đọc mã nguồn. Bạn BẮT BUỘC phải phân tích và trả lời đầy đủ, chi tiết, dứt khoát dựa trên tài liệu SRS và nghiệp vụ hệ thống. TUYỆT ĐỐI KHÔNG sinh văn bản giả lập gọi tool (như 'Gọi tool:' hoặc 'search_codebase'), TUYỆT ĐỐI KHÔNG nói 'cần tra cứu thêm mã nguồn'.";
      }
      if (isFinalTurn) {
        turnInstruction +=
          "\n\nLƯU Ý: Đây là lượt trả lời chính thức cuối cùng. Bạn hãy dựa trên tất cả tài liệu SRS và nghiệp vụ hệ thống để giải thích tường tận và đưa ra đối chiếu rõ ràng bằng tiếng Việt. TUYỆT ĐỐI KHÔNG gọi thêm tool.";
      }

      const aiResponse = await aiClient.generateContent({
        contents,
        systemInstruction: turnInstruction,
        tools: activeTools,
      });

      lastAiResponse = aiResponse;

      if (aiResponse.functionCalls && aiResponse.functionCalls.length > 0 && toolDispatcher) {
        contents.push({
          role: "model",
          parts: aiResponse.functionCalls.map((call: any) => ({ functionCall: call })),
        });

        for (const call of aiResponse.functionCalls) {
          let toolResult = "";
          try {
            toolResult = await toolDispatcher({ name: call.name, args: call.args || {} });
          } catch (err: any) {
            toolResult = `Lỗi thực thi tool ${call.name}: ${err.message || String(err)}`;
          }

          toolTrace.push({
            name: call.name,
            args: call.args,
            resultSnippet: typeof toolResult === "string" ? toolResult.slice(0, 300) : JSON.stringify(toolResult).slice(0, 300),
          });

          contents.push({
            role: "user",
            parts: [
              {
                functionResponse: {
                  name: call.name,
                  response: { result: toolResult },
                },
              },
            ],
          });
        }
      } else {
        responseText = aiResponse.text || "";
        break;
      }
    }

    const cleanedResponse = this.cleanHallucinations(responseText);

    return {
      response: cleanedResponse,
      toolTrace,
      currentTurn,
      maxTurns,
      lastAiResponse,
    };
  }
}
