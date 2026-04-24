import { google } from 'googleapis';
import fs from 'node:fs';

const creds = JSON.parse(fs.readFileSync('/Users/apple/.config/gws/service-account.json', 'utf8'));
const SENDER = 'cs@life-time-support.com';
const RECIPIENT = 'ryouchiku@life-time-support.com'; // 再度龍竹さんに

const testImage = fs.readFileSync('/Users/apple/scripts/lts-sales-crm/IMG_7830.png');
console.log('Test image size:', testImage.length, 'bytes');

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
  return { status: res.status, body: await res.text() };
}

const a = await auth();
const space = await findDM(a, RECIPIENT);
console.log('space:', space);

console.log('\n--- Test upload ---');
const r = await uploadAttachment(a, space, 'test-screenshot.png', 'image/png', testImage);
console.log('status:', r.status);
console.log('body:', r.body.slice(0, 400));

if (r.status === 200) {
  const ref = JSON.parse(r.body).attachmentDataRef;
  const token = (await a.getAccessToken()).token;
  const url = `https://chat.googleapis.com/v1/${space}/messages`;
  const send = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      text: '🧪 添付ファイルテスト。画像が見えてたらOK！',
      attachment: [{ attachmentDataRef: ref }],
    }),
  });
  console.log('\n--- Send with attachment ---');
  console.log('status:', send.status);
  console.log('body:', (await send.text()).slice(0, 300));
}
