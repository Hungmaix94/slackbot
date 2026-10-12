import { Env } from "../config/env";
import { SlackClient } from "../slack/client";
import { PlaneClient } from "../plane/client";
import { resolvePlaneUserId } from "../slack/user-mapping";
import { checkDuplicatePlaneIssues } from "../plane/duplicates";
import { buildPlaneBugHtmlDescription } from "../plane/task-builder";
import { resolvePlaneProject } from "../plane/projects";
import { resolvePlaneModule } from "../plane/modules";
import { extractTaskFromThread } from "../ai/task-extractor";
import { createTaskCreatedCard } from "../slack/blocks";
import { createAiClient } from "../core/ai-client-factory";

export class TaskCreatorWorkflow {
  constructor(
    private env: Env,
    private slack: SlackClient,
    private plane?: PlaneClient
  ) {}

  async handleCreateFromThread(params: {
    channelId: string;
    threadTs: string;
    slackUserId: string;
    progressMsgTs: string;
    commandQuery?: string;
  }): Promise<void> {
    const { channelId, threadTs, slackUserId, progressMsgTs, commandQuery } =
      params;

    if (!this.plane) {
      await this.slack.updateMessage(
        channelId,
        progressMsgTs,
        "⚠️ Chưa cấu hình Plane API Key trong môi trường."
      );
      return;
    }

    // 1. Lấy toàn bộ tin nhắn trong thread
    const messages = await this.slack.getConversationReplies(channelId, threadTs);
    if (!messages || messages.length === 0) {
      await this.slack.updateMessage(
        channelId,
        progressMsgTs,
        "⚠️ Không tìm thấy nội dung tin nhắn trong thread này để tạo task."
      );
      return;
    }

    // 2. Xác định dự án mục tiêu (Dynamic Project Resolution)
    const userMessagesText = messages
      .filter((m) => !m.bot_id && m.subtype !== "bot_message")
      .map((m) => m.text || "")
      .join(" ");

    const targetProject = await resolvePlaneProject({
      text: `${commandQuery || ""} ${userMessagesText}`,
      channelId,
      env: this.env,
      planeClient: this.plane,
    });
    const projectId = targetProject.id;
    const projectIdentifier = targetProject.identifier;

    // 3. Nhận diện người tạo / assignees trên Plane cho dự án này
    const userMatch = await resolvePlaneUserId(
      slackUserId,
      this.slack,
      this.env,
      this.plane,
      projectId
    );

    // Quét toàn bộ mentions trong thread để phát hiện người được giao việc / xử lý lỗi
    const mentionRegex = /<@([A-Z0-9]+)>/g;
    const candidateSlackUserIds = new Set<string>();

    for (const msg of messages) {
      if (msg.text) {
        let match: RegExpExecArray | null;
        while ((match = mentionRegex.exec(msg.text)) !== null) {
          const mentionedId = match[1];
          if (mentionedId && mentionedId !== slackUserId) {
            candidateSlackUserIds.add(mentionedId);
          }
        }
      }
    }

    const resolvedAssignees: { id: string; name: string }[] = [];

    // Ưu tiên resolve các user được tag trong thread
    for (const mSlackId of candidateSlackUserIds) {
      const resolved = await resolvePlaneUserId(
        mSlackId,
        this.slack,
        this.env,
        this.plane,
        projectId
      );
      if (resolved.id && !resolvedAssignees.some((a) => a.id === resolved.id)) {
        resolvedAssignees.push({ id: resolved.id, name: resolved.name });
      }
    }

    // Nếu không có ai được tag hoặc không map được ai từ tag, gán cho người yêu cầu (userMatch)
    if (resolvedAssignees.length === 0 && userMatch.id) {
      resolvedAssignees.push({ id: userMatch.id, name: userMatch.name });
    }

    // Fallback: nếu người yêu cầu cũng chưa map được, thử fallback người gửi tin nhắn đầu tiên của thread
    if (
      resolvedAssignees.length === 0 &&
      messages[0]?.user &&
      messages[0].user !== slackUserId
    ) {
      const reporterMatch = await resolvePlaneUserId(
        messages[0].user,
        this.slack,
        this.env,
        this.plane,
        projectId
      );
      if (reporterMatch.id) {
        resolvedAssignees.push({ id: reporterMatch.id, name: reporterMatch.name });
      }
    }

    const assigneeIds = resolvedAssignees.map((a) => a.id);
    const assigneeDisplayNames = resolvedAssignees
      .map((a) => a.name)
      .filter(Boolean)
      .join(", ");

    // 4. Trích xuất nội dung Bug Report bằng AI + Heuristic Fallback
    const aiInstance = createAiClient(this.env);
    const taskJson = await extractTaskFromThread({
      messages,
      threadTs,
      query: commandQuery || "",
      aiClient: aiInstance.client,
    });

    // 5. Kiểm tra xem có bug nào bị trùng không (Smart Duplicate Check trên Plane)
    const duplicateCheck = await checkDuplicatePlaneIssues(
      this.plane,
      projectId,
      taskJson.taskName,
      projectIdentifier
    );
    let duplicateWarning = "";
    if (duplicateCheck.hasDuplicate) {
      const dup = duplicateCheck.duplicateIssues[0];
      const dupDisplay = dup.sequenceId
        ? `${projectIdentifier}-${dup.sequenceId}`
        : dup.id.slice(0, 8);
      duplicateWarning = `\n> ⚠️ *Lưu ý trùng lặp:* Phát hiện task tương tự trên Plane: <${dup.url}|[${dupDisplay}] ${dup.name}> (${dup.state})`;
    }

    // 6. Thu thập file đính kèm từ Slack & liên kết ngoài
    const evidenceFiles: { name: string; url: string; mimetype?: string }[] = [];
    const externalLinks: { name: string; url: string }[] = [];

    for (const msg of messages) {
      if (msg.files && Array.isArray(msg.files)) {
        for (const f of msg.files) {
          if (f.url_private) {
            evidenceFiles.push({
              name: f.name || "Tệp đính kèm Slack",
              url: f.url_private,
              mimetype: f.mimetype || "image/png",
            });
          }
        }
      }
      if (msg.text) {
        const urlMatches = msg.text.match(/https?:\/\/[^\s>]+/g);
        if (urlMatches) {
          for (const u of urlMatches) {
            if (!u.includes("slack.com") && !externalLinks.some((l) => l.url === u)) {
              let linkName = u;
              if (u.includes("portal.maivietland.vn"))
                linkName = "Cổng thông tin Portal MaiVietLand";
              else if (u.includes("sale.maivietland.vn"))
                linkName = "Trang bán hàng App Sale";
              externalLinks.push({ name: linkName, url: u });
            }
          }
        }
      }
    }

    // 7. Tạo mô tả task chuẩn theo HTML cho Plane
    const slackThreadUrl = `https://slack.com/app_redirect?channel=${channelId}&thread_ts=${threadTs}`;
    const descriptionHtml = buildPlaneBugHtmlDescription({
      moduleName: taskJson.moduleName,
      environment: "Staging",
      deviceInfo: "Chrome / Web",
      severity: taskJson.severity,
      stepsToReproduce: taskJson.stepsToReproduce || [],
      actualBehavior: taskJson.actualBehavior,
      expectedBehavior: taskJson.expectedBehavior,
      slackThreadUrl,
      slackMetadata: `channel_id=${channelId} thread_ts=${threadTs} project=${projectIdentifier}`,
      nativeAttachmentsCount: evidenceFiles.length,
      externalLinks,
    });

    // 8. Tạo task trên Plane (tự động truy vấn state mặc định / backlog hợp lệ của chính dự án đó)
    let stateId: string | undefined = undefined;
    try {
      const states = await this.plane.getProjectStates(projectId);
      const defaultState =
        states.find((s) => s.default) ||
        states.find((s) => s.group === "backlog") ||
        states.find((s) => s.group === "unstarted") ||
        states[0];
      if (defaultState) {
        stateId = defaultState.id;
      }
    } catch (stateErr) {
      console.warn("Lỗi lấy default state cho project:", stateErr);
    }

    const createdIssue = await this.plane.createIssue(projectId, {
      name: taskJson.taskName,
      description_html: descriptionHtml,
      priority: taskJson.severity,
      state: stateId,
      assignees: assigneeIds.length > 0 ? assigneeIds : undefined,
    });

    // 9. Tải file từ Slack và upload trực tiếp làm file đính kèm vào mục Attachments của Plane issue
    if (evidenceFiles.length > 0 && this.plane) {
      for (const f of evidenceFiles) {
        try {
          const fileBuffer = await this.slack.downloadFile(f.url);
          await this.plane.uploadIssueAttachment(
            projectId,
            createdIssue.id,
            fileBuffer,
            f.name,
            f.mimetype || "image/png"
          );
        } catch (attErr) {
          console.warn(`Lỗi upload attachment "${f.name}" lên Plane:`, attErr);
        }
      }
    }

    // 10. Gán issue vào Module tương ứng (nếu phát hiện alias p31, as, crm, ai, ui...)
    const targetModule = resolvePlaneModule(commandQuery || taskJson.moduleName);
    if (targetModule) {
      try {
        await this.plane.addIssueToModule(projectId, targetModule.id, createdIssue.id);
      } catch (modErr) {
        console.warn("Lỗi gán module cho issue:", modErr);
      }
    }

    const issueUrl = this.plane.getIssueWebUrl(
      projectId,
      createdIssue.id,
      projectIdentifier,
      createdIssue.sequence_id
    );

    // 11. Tạo các Sub-tasks con nếu phát hiện nhiều mục/lỗi trong thread
    const subtasksTree: { name: string; url: string; displayId?: string }[] = [];
    if (taskJson.subtasks && taskJson.subtasks.length > 0) {
      for (const subItem of taskJson.subtasks) {
        try {
          const subName = typeof subItem === "string" ? subItem : subItem.name;
          let subAssigneeIds = assigneeIds;

          // Nếu subtask có assignee riêng từ tag Slack, resolve riêng cho subtask đó
          if (typeof subItem !== "string" && subItem.assigneeSlackId) {
            const mapped = await resolvePlaneUserId(
              subItem.assigneeSlackId,
              this.slack,
              this.env,
              this.plane,
              projectId
            );
            if (mapped.id) {
              subAssigneeIds = [mapped.id];
            }
          }

          const subIssue = await this.plane.createIssue(projectId, {
            name: subName,
            description_html: `<p>Sub-task của parent issue: <a href="${issueUrl}">${createdIssue.name}</a></p>`,
            priority: taskJson.severity,
            state: stateId,
            parent: createdIssue.id,
            assignees: subAssigneeIds.length > 0 ? subAssigneeIds : undefined,
          });

          if (targetModule) {
            await this.plane.addIssueToModule(projectId, targetModule.id, subIssue.id);
          }

          const subDisplayId = subIssue.sequence_id
            ? `${projectIdentifier}-${subIssue.sequence_id}`
            : subIssue.id.slice(0, 8);
          const subUrl = this.plane.getIssueWebUrl(
            projectId,
            subIssue.id,
            projectIdentifier,
            subIssue.sequence_id
          );
          subtasksTree.push({ name: subName, url: subUrl, displayId: subDisplayId });
        } catch (subErr) {
          console.warn("Lỗi tạo subtask trên Plane:", subErr);
        }
      }
    }

    // 12. Cập nhật thông báo lên Slack
    const displayId = createdIssue.sequence_id
      ? `${projectIdentifier}-${createdIssue.sequence_id}`
      : createdIssue.id.slice(0, 8);

    const cardBlocks = createTaskCreatedCard({
      id: createdIssue.id,
      displayId,
      name: createdIssue.name,
      url: issueUrl,
      assigneeName: assigneeDisplayNames || userMatch.name || "Chưa gán",
      status: "Backlog",
      systemName: "Plane",
      projectName: `${targetProject.name} (${targetProject.identifier})`,
      moduleName: targetModule ? targetModule.name : undefined,
      subtasksTree: subtasksTree.length > 0 ? subtasksTree : undefined,
      attachmentsCount: evidenceFiles.length,
    });

    if (duplicateWarning) {
      cardBlocks.splice(1, 0, {
        type: "section",
        text: { type: "mrkdwn", text: duplicateWarning },
      });
    }

    await this.slack.updateMessage(channelId, progressMsgTs, "Đã tạo task Plane thành công!", {
      blocks: cardBlocks,
    });
  }
}
