import { google } from 'googleapis';
import fs from 'node:fs';

const creds = JSON.parse(fs.readFileSync('/Users/apple/.config/gws/service-account.json', 'utf8'));
const SENDER = 'cs@life-time-support.com';
const RECIPIENTS = ['ryouchiku@life-time-support.com', 'r.kabashima@life-time-support.com'];

async function getAuth(sender) {
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/chat.spaces', 'https://www.googleapis.com/auth/chat.messages.create'],
    subject: sender,
  });
  await auth.authorize();
  return auth;
}

async function checkDM(recipient) {
  const auth = await getAuth(SENDER);
  const token = (await auth.getAccessToken()).token;
  const url = `https://chat.googleapis.com/v1/spaces:findDirectMessage?name=${encodeURIComponent('users/' + recipient)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.text();
  return { recipient, status: res.status, body: body.slice(0, 200) };
}

const results = [];
for (const r of RECIPIENTS) {
  try {
    results.push(await checkDM(r));
  } catch (e) {
    results.push({ recipient: r, error: e.message });
  }
}
console.log(JSON.stringify(results, null, 2));
