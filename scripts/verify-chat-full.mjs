import { google } from 'googleapis';
import fs from 'node:fs';

const creds = JSON.parse(fs.readFileSync('/Users/apple/.config/gws/service-account.json', 'utf8'));
const SENDER = 'cs@life-time-support.com';
const RECIPIENTS = ['r.kabashima@life-time-support.com']; // 樺嶋さんのみテスト（龍竹さんは済）

// 1x1 tiny PNG (base64)
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==',
  'base64'
);

async function auth() {
  const a = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [
      'https://www.googleapis.com/auth/chat.spaces.readonly',
      'https://www.googleapis.com/auth/chat.messages.create',
    ],
    subject: SENDER,
  });
  await a.authorize();
  return a;
}

async function findDM(a, recipient) {
  const token = (await a.getAccessToken()).token;
  const url = `https://chat.googleapis.com/v1/spaces:findDirectMessage?name=${encodeURIComponent('users/' + recipient)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`findDM ${recipient}: ${res.status} ${await res.text()}`);
  return (await res.json()).name;
}

async function uploadAttachment(a, space, filename, contentType, data) {
  const token = (await a.getAccessToken()).token;
  const boundary = `boundary_${Date.now()}`;
  const metadata = JSON.stringify({ filename });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const url = `https://chat.googleapis.com/upload/v1/${space}/attachments:upload?uploadType=multipart`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}`, Authorization: `Bearer ${token}` },
    body,
  });
  if (!res.ok) throw new Error(`upload: ${res.status} ${await res.text()}`);
  return (await res.json()).attachmentDataRef;
}

async function sendMessage(a, space, text, attachmentRef) {
  const token = (await a.getAccessToken()).token;
  const url = `https://chat.googleapis.com/v1/${space}/messages`;
  const body = { text };
  if (attachmentRef) body.attachment = [{ attachmentDataRef: attachmentRef }];
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.text()).slice(0, 300) };
}

const a = await auth();
for (const recipient of RECIPIENTS) {
  console.log(`\n=== ${recipient} ===`);
  try {
    const space = await findDM(a, recipient);
    console.log('DM space:', space);
    const ref = await uploadAttachment(a, space, 'test.png', 'image/png', tinyPng);
    console.log('attachment ref:', ref.resourceName);
    const text = `🧪 CRMサポート窓口テスト（添付あり）\n本機能の動作確認DMです。画像が届いていればバッチリ！\n(from: ルル)`;
    const result = await sendMessage(a, space, text, ref);
    console.log('send status:', result.status);
    console.log('response:', result.body);
  } catch (e) {
    console.log('ERROR:', e.message.slice(0, 400));
  }
}
