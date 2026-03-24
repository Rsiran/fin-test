"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";

export const sendSlackNotification = internalAction({
  args: {
    category: v.string(),
    description: v.string(),
    stepsToReproduce: v.optional(v.string()),
    pageUrl: v.string(),
    userEmail: v.string(),
    userAgent: v.string(),
    screenshotUrl: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn("SLACK_WEBHOOK_URL not set, skipping notification");
      return;
    }

    const categoryLabels: Record<string, string> = {
      bug: "Bug Report",
      feature: "Feature Idea",
      general: "General Feedback",
    };

    const header = categoryLabels[args.category] ?? "Feedback";
    const browser = parseBrowser(args.userAgent);

    let text = `*${header}*\n${"─".repeat(40)}\n\n`;
    text += `*Description:*\n${args.description}\n\n`;

    if (args.stepsToReproduce) {
      text += `*Steps to reproduce:*\n${args.stepsToReproduce}\n\n`;
    }

    text += `*Page:* ${args.pageUrl}\n`;
    text += `*User:* ${args.userEmail}\n`;
    text += `*Browser:* ${browser}\n`;

    const blocks: unknown[] = [
      {
        type: "section",
        text: { type: "mrkdwn", text },
      },
    ];

    if (args.screenshotUrl) {
      blocks.push({
        type: "image",
        image_url: args.screenshotUrl,
        alt_text: "Screenshot",
      });
    }

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });
  },
});

function parseBrowser(userAgent: string): string {
  if (userAgent.includes("Chrome") && !userAgent.includes("Edg")) {
    const match = userAgent.match(/Chrome\/([\d.]+)/);
    return `Chrome ${match?.[1]?.split(".")[0] ?? ""}`;
  }
  if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
    const match = userAgent.match(/Version\/([\d.]+)/);
    return `Safari ${match?.[1]?.split(".")[0] ?? ""}`;
  }
  if (userAgent.includes("Firefox")) {
    const match = userAgent.match(/Firefox\/([\d.]+)/);
    return `Firefox ${match?.[1]?.split(".")[0] ?? ""}`;
  }
  if (userAgent.includes("Edg")) {
    const match = userAgent.match(/Edg\/([\d.]+)/);
    return `Edge ${match?.[1]?.split(".")[0] ?? ""}`;
  }
  return userAgent.slice(0, 50);
}
