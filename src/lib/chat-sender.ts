/**
 * Google Chat DM送信ユーティリティ
 *
 * Domain-wide delegation + chat.messages.create スコープで
 * 指定されたsender(cs@life-time-support.com等)として個別DMを送信する。
 *
 * 事前条件: GCPコンソールでサービスアカウントに以下のスコープを委譲済みであること
 *   - https://www.googleapis.com/auth/chat.spaces
 *   - https://www.googleapis.com/auth/chat.messages.create
 */
import { google } from "googleapis";

function parseServiceAccountKey() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY env var not set");
  let parsed: { client_email?: string; private_key?: string; client_id?: string };
  try {
    parsed = JSON.parse(keyJson);
  } catch {
    const decoded = Buffer.from(keyJson, "base64").toString("utf8");
    parsed = JSON.parse(decoded);
  }
  // 診断ログ（初回呼び出し時のみ）- 機密情報は含めない
  if (!globalThis.__cs_logged) {
    console.log("[chat-sender] env_length:", keyJson.length);
    console.log("[chat-sender] client_email:", parsed.client_email);
    console.log("[chat-sender] client_id:", parsed.client_id);
    console.log("[chat-sender] has_private_key:", !!parsed.private_key);
    console.log(
      "[chat-sender] private_key_prefix:",
      parsed.private_key ? parsed.private_key.slice(0, 30) : null
    );
    (globalThis as unknown as { __cs_logged: boolean }).__cs_logged = true;
  }
  return parsed;
}

declare global {
  // eslint-disable-next-line no-var
  var __cs_logged: boolean | undefined;
}

/** sender として認証済みクライアントを取得（ドメインワイド委譲） */
async function getAuthForSender(senderEmail: string) {
  const creds = parseServiceAccountKey();
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [
      "https://www.googleapis.com/auth/chat.spaces",
      "https://www.googleapis.com/auth/chat.messages.create",
    ],
    subject: senderEmail,
  });
  await auth.authorize();
  return auth;
}

/**
 * 指定したユーザーとのDM space を解決する
 */
async function findDirectMessageSpace(
  senderEmail: string,
  recipientEmail: string
): Promise<string | null> {
  const auth = await getAuthForSender(senderEmail);
  const token = (await auth.getAccessToken()).token;
  const url = `https://chat.googleapis.com/v1/spaces:findDirectMessage?name=${encodeURIComponent(
    "users/" + recipientEmail
  )}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { name?: string };
  return data.name ?? null;
}

/**
 * 添付ファイルをDMスペースにアップロードし attachmentDataRef を返す。
 * Chat API は通常 `attachmentUploadToken` を返す（新形式）。
 * 古いレスポンスでは `resourceName` だけのこともあるため両対応。
 */
async function uploadAttachment(params: {
  senderEmail: string;
  space: string;
  filename: string;
  contentType: string;
  data: Buffer;
}): Promise<{ resourceName?: string; attachmentUploadToken?: string }> {
  const { senderEmail, space, filename, contentType, data } = params;
  const auth = await getAuthForSender(senderEmail);
  const token = (await auth.getAccessToken()).token;

  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ filename });

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`
    ),
    Buffer.from(`--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const url = `https://chat.googleapis.com/upload/v1/${space}/attachments:upload?uploadType=multipart`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/related; boundary=${boundary}`,
      Authorization: `Bearer ${token}`,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`attachment upload HTTP ${res.status}: ${err.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    attachmentDataRef?: { resourceName?: string; attachmentUploadToken?: string };
  };
  const ref = json.attachmentDataRef;
  if (!ref?.resourceName && !ref?.attachmentUploadToken) {
    throw new Error("attachment upload: neither resourceName nor attachmentUploadToken returned");
  }
  return {
    resourceName: ref.resourceName,
    attachmentUploadToken: ref.attachmentUploadToken,
  };
}

/** 指定ユーザーにDMでメッセージ（＋任意で添付ファイル）を送信 */
export async function sendChatDM(params: {
  senderEmail: string;
  recipientEmail: string;
  text: string;
  attachment?: {
    filename: string;
    contentType: string;
    data: Buffer;
  };
}): Promise<{ success: boolean; messageName?: string; error?: string }> {
  const { senderEmail, recipientEmail, text, attachment } = params;
  try {
    const space = await findDirectMessageSpace(senderEmail, recipientEmail);
    if (!space) {
      return { success: false, error: `DM space not found for ${recipientEmail}` };
    }

    const messageBody: Record<string, unknown> = { text };

    if (attachment) {
      const ref = await uploadAttachment({
        senderEmail,
        space,
        filename: attachment.filename,
        contentType: attachment.contentType,
        data: attachment.data,
      });
      messageBody.attachment = [{ attachmentDataRef: ref }];
    }

    const auth = await getAuthForSender(senderEmail);
    const token = (await auth.getAccessToken()).token;
    const url = `https://chat.googleapis.com/v1/${space}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(messageBody),
    });
    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${err.slice(0, 300)}` };
    }
    const data = (await res.json()) as { name?: string };
    return { success: true, messageName: data.name };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
