import { google } from 'googleapis';
import fs from 'node:fs';

const creds = JSON.parse(fs.readFileSync('/Users/apple/.config/gws/service-account.json', 'utf8'));
const SENDER = 'cs@life-time-support.com';
const RECIPIENTS = ['ryouchiku@life-time-support.com', 'r.kabashima@life-time-support.com'];

async function auth(sender) {
  const a = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [
      'https://www.googleapis.com/auth/chat.spaces.readonly',
      'https://www.googleapis.com/auth/chat.messages.create',
    ],
    subject: sender,
  });
  await a.authorize();
  return a;
}

async function findDM(sender, recipient) {
  const a = await auth(sender);
  const token = (await a.getAccessToken()).token;
  const url = `https://chat.googleapis.com/v1/spaces:findDirectMessage?name=${encodeURIComponent('users/' + recipient)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.text() };
}

console.log('=== findDirectMessage tests ===');
for (const r of RECIPIENTS) {
  try {
    const { status, body } = await findDM(SENDER, r);
    const parsed = status === 200 ? JSON.parse(body).name : body.slice(0, 200);
    console.log(`${r}: HTTP ${status} => ${parsed}`);
  } catch (e) {
    console.log(`${r}: ERROR ${e.message.slice(0, 200)}`);
  }
}
