export interface SlackMessageOptions {
  thread_ts?: string;
  blocks?: any[];
}

export class SlackClient {
  private token: string;
  private baseUrl = "https://slack.com/api";

  constructor(token: string) {
    this.token = token;
  }

  private async callApi(endpoint: string, payload: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    const data: any = await res.json();
    if (!data.ok) {
      throw new Error(`Slack API error on ${endpoint}: ${data.error || JSON.stringify(data)}`);
    }
    return data;
  }

  async postMessage(channel: string, text: string, options?: SlackMessageOptions): Promise<{ ts: string }> {
    const payload: any = {
      channel,
      text,
      ...options,
    };
    const res = await this.callApi("chat.postMessage", payload);
    return { ts: res.ts };
  }

  async updateMessage(channel: string, ts: string, text: string, options?: { blocks?: any[] }): Promise<void> {
    const payload: any = {
      channel,
      ts,
      text,
    };
    if (options && options.blocks !== undefined) {
      payload.blocks = options.blocks;
    } else {
      payload.blocks = [];
    }
    try {
      await this.callApi("chat.update", payload);
    } catch (err: any) {
      if (err.message && err.message.includes("ratelimited")) {
        console.warn("Slack chat.update rate limited, retrying in 800ms...");
        await new Promise((r) => setTimeout(r, 800));
        try {
          await this.callApi("chat.update", payload);
        } catch (retryErr) {
          console.error("Slack chat.update retry failed:", retryErr);
        }
      } else {
        throw err;
      }
    }
  }

  async addReaction(channel: string, timestamp: string, name: string): Promise<void> {
    try {
      await this.callApi("reactions.add", {
        channel,
        timestamp,
        name,
      });
    } catch (e) {
      // Bỏ qua lỗi nếu reaction đã tồn tại
      console.warn(`Could not add reaction ${name}:`, e);
    }
  }

  async removeReaction(channel: string, timestamp: string, name: string): Promise<void> {
    try {
      await this.callApi("reactions.remove", {
        channel,
        timestamp,
        name,
      });
    } catch (e) {
      console.warn(`Could not remove reaction ${name}:`, e);
    }
  }

  async getConversationReplies(channel: string, thread_ts: string): Promise<any[]> {
    const url = new URL(`${this.baseUrl}/conversations.replies`);
    url.searchParams.set("channel", channel);
    url.searchParams.set("ts", thread_ts);
    url.searchParams.set("limit", "100");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    const data: any = await res.json();
    if (!data.ok) {
      throw new Error(`Failed to get thread replies: ${data.error}`);
    }
    return data.messages || [];
  }

  async getUserInfo(userId: string): Promise<any> {
    const url = new URL(`${this.baseUrl}/users.info`);
    url.searchParams.set("user", userId);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    const data: any = await res.json();
    if (!data.ok) {
      return null;
    }
    return data.user;
  }

  async downloadPrivateFile(urlPrivate: string): Promise<ArrayBuffer> {
    const res = await fetch(urlPrivate, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to download Slack private file: ${res.statusText}`);
    }
    return await res.arrayBuffer();
  }

  /**
   * Upload tệp tin lên Slack bằng Slack files.uploadV2 (getUploadURLExternal + completeUploadExternal)
   */
  async uploadFileV2(
    channel: string,
    fileBuffer: ArrayBuffer | Uint8Array,
    filename: string,
    title?: string,
    initialComment?: string,
    thread_ts?: string
  ): Promise<void> {
    const length = fileBuffer.byteLength;

    // Bước 1: Lấy upload URL từ Slack
    const urlRes = await this.callApi("files.getUploadURLExternal", {
      filename,
      length,
    });

    const uploadUrl = urlRes.upload_url;
    const fileId = urlRes.file_id;

    // Bước 2: Đẩy binary file lên upload URL
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      body: fileBuffer,
    });

    if (!uploadRes.ok) {
      throw new Error(`Failed to upload binary file to Slack upload URL: ${uploadRes.statusText}`);
    }

    // Bước 3: Hoàn tất quá trình upload và share vào channel/thread
    await this.callApi("files.completeUploadExternal", {
      files: [
        {
          id: fileId,
          title: title || filename,
        },
      ],
      channel_id: channel,
      initial_comment: initialComment,
      thread_ts,
    });
  }
}
