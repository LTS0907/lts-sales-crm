import { google } from 'googleapis';
import fs from 'node:fs';

const creds = JSON.parse(fs.readFileSync('/Users/apple/.config/gws/service-account.json', 'utf8'));
const SENDER = 'cs@life-time-support.com';

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
  if (!res.ok) return null;
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
  return { status: res.status, body: (await res.text()).slice(0, 200) };
}

const a = await auth();
const space = await findDM(a, 'r.kabashima@life-time-support.com');
console.log('DM space:', space);
const text = `🧪 CRM サポート窓口 動作テスト\n樺嶋さん、これはルルから動作テストDMです。届いていればOK！\n(DWDスコープ追加後の疎通確認です)`;
const result = await sendMessage(a, space, text);
console.log('status:', result.status, result.body);
