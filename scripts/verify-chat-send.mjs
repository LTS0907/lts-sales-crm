import { google } from 'googleapis';
import fs from 'node:fs';

const creds = JSON.parse(fs.readFileSync('/Users/apple/.config/gws/service-account.json', 'utf8'));
const SENDER = 'cs@life-time-support.com';
const RECIPIENT = 'ryouchiku@life-time-support.com'; // まずは龍竹さんへテスト送信

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
  if (!res.ok) throw new Error(`findDM failed: ${res.status} ${await res.text()}`);
  return (await res.json()).name;
}

async function sendMessage(a, space, text) {
  const token = (await a.getAccessToken()).token;
  const url = `https://chat.googleapis.com/v1/${space}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
  });
  return { status: res.status, body: await res.text() };
}

const a = await auth();
const space = await findDM(a, RECIPIENT);
console.log('DM space:', space);
const testText = `🧪 *CRM サポート窓口 動作テスト*\n\nDWDスコープ追加後の接続テストだよ！\nこのメッセージが届いていれば、Google Chat DM 送信が正常動作してます。\n\n(from: ルル / ${new Date().toISOString()})`;
const result = await sendMessage(a, space, testText);
console.log('send status:', result.status);
console.log('response:', result.body.slice(0, 300));
