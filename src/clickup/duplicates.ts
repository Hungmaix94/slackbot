import { ClickUpClient, ClickUpTask } from "./client";

export interface DuplicateCheckResult {
  hasDuplicate: boolean;
  duplicateTasks: {
    id: string;
    name: string;
    status: string;
    url: string;
    assigneeName?: string;
  }[];
}

/**
 * Kiểm tra các task trùng lặp trên ClickUp trước khi tạo mới
 */
export async function checkDuplicateClickUpTasks(
  client: ClickUpClient,
  listId: string,
  taskTitle: string
): Promise<DuplicateCheckResult> {
  const existingTasks = await client.getTasks(listId, { includeClosed: false });
  const titleLower = taskTitle.toLowerCase();
  const words = titleLower.split(/\s+/).filter((w) => w.length > 3 && !["lỗi", "không", "được", "trên", "phân", "hệ"].includes(w));

  const matched: DuplicateCheckResult["duplicateTasks"] = [];

  for (const task of existingTasks) {
    const taskNameLower = (task.name || "").toLowerCase();
    
    // Đếm số từ trùng khớp
    let matchCount = 0;
    for (const word of words) {
      if (taskNameLower.includes(word)) {
        matchCount++;
      }
    }

    // Nếu trùng > 50% số từ quan trọng hoặc tên gần như giống hệt
    if (words.length > 0 && matchCount / words.length >= 0.5) {
      matched.push({
        id: task.id,
        name: task.name,
        status: task.status?.status || "OPEN",
        url: task.url || `https://app.clickup.com/t/${task.id}`,
        assigneeName: task.assignees?.[0]?.username,
      });
    }
  }

  return {
    hasDuplicate: matched.length > 0,
    duplicateTasks: matched.slice(0, 3),
  };
}
