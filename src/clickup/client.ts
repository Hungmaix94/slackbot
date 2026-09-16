export interface ClickUpTask {
  id: string;
  name: string;
  description?: string;
  markdown_description?: string;
  status?: {
    status: string;
    color?: string;
  };
  url?: string;
  assignees?: {
    id: number;
    username: string;
    email: string;
  }[];
}

export interface CreateTaskPayload {
  name: string;
  description?: string;
  markdown_description?: string;
  assignees?: number[];
  status?: string;
  priority?: number;
  tags?: string[];
}

export class ClickUpClient {
  private token: string;
  private baseUrl = "https://api.clickup.com/api/v2";

  constructor(token: string) {
    this.token = token;
  }

  private get headers(): HeadersInit {
    return {
      Authorization: this.token,
      "Content-Type": "application/json",
    };
  }

  async getTasks(listId: string, options?: { includeClosed?: boolean }): Promise<ClickUpTask[]> {
    const url = new URL(`${this.baseUrl}/list/${listId}/task`);
    url.searchParams.set("include_closed", String(options?.includeClosed ?? true));
    url.searchParams.set("subtasks", "true");

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: this.headers,
    });

    if (!res.ok) {
      throw new Error(`ClickUp API error getTasks: ${res.status} ${res.statusText}`);
    }

    const data: any = await res.json();
    return data.tasks || [];
  }

  async getTask(taskId: string): Promise<ClickUpTask | null> {
    const cleanId = taskId.replace(/[^a-zA-Z0-9]/g, "");
    const res = await fetch(`${this.baseUrl}/task/${cleanId}?include_markdown_description=true`, {
      method: "GET",
      headers: this.headers,
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`ClickUp API error getTask: ${res.status} ${res.statusText}`);
    }

    return await res.json();
  }

  async createTask(listId: string, payload: CreateTaskPayload): Promise<ClickUpTask> {
    const res = await fetch(`${this.baseUrl}/list/${listId}/task`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`ClickUp API error createTask: ${res.status} - ${errorText}`);
    }

    return await res.json();
  }

  async updateTask(taskId: string, payload: Partial<CreateTaskPayload>): Promise<ClickUpTask> {
    const cleanId = taskId.replace(/[^a-zA-Z0-9]/g, "");
    const res = await fetch(`${this.baseUrl}/task/${cleanId}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`ClickUp API error updateTask: ${res.status} - ${errorText}`);
    }

    return await res.json();
  }

  async uploadAttachment(
    taskId: string,
    filename: string,
    fileBuffer: ArrayBuffer | Uint8Array,
    contentType = "application/octet-stream"
  ): Promise<any> {
    const cleanId = taskId.replace(/[^a-zA-Z0-9]/g, "");
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: contentType });
    formData.append("attachment", blob, filename);

    const res = await fetch(`${this.baseUrl}/task/${cleanId}/attachment`, {
      method: "POST",
      headers: {
        Authorization: this.token,
      },
      body: formData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`ClickUp API error uploadAttachment: ${res.status} - ${errorText}`);
    }

    return await res.json();
  }

  async searchTasks(
    listId: string,
    query: string,
    filterBugs = false
  ): Promise<ClickUpTask[]> {
    const allTasks = await this.getTasks(listId, { includeClosed: true });
    if (!query) return allTasks;

    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/\s+/).filter((k) => k.length >= 2);

    return allTasks.filter((task) => {
      const name = (task.name || "").toLowerCase();
      const desc = (task.markdown_description || task.description || "").toLowerCase();

      // Check keywords
      const matchesKeyword =
        keywords.length === 0 ||
        keywords.some((kw) => name.includes(kw) || desc.includes(kw));

      if (!matchesKeyword) return false;

      // Filter bugs if specified
      if (filterBugs) {
        const isBug =
          name.includes("bug") ||
          name.includes("lỗi") ||
          desc.includes("bug") ||
          desc.includes("lỗi");
        return isBug;
      }

      return true;
    });
  }
}
