import { google } from 'googleapis';
import fs from 'node:fs';

const creds = JSON.parse(fs.readFileSync('/Users/apple/.config/gws/service-account.json', 'utf8'));
const SENDERS = ['cs@life-time-support.com', 'info@life-time-support.com', 'ryouchiku@life-time-support.com'];
const RECIPIENTS = ['ryouchiku@life-time-support.com', 'r.kabashima@life-time-support.com'];

async function checkDM(sender, recipient) {
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/chat.spaces', 'https://www.googleapis.com/auth/chat.messages.create'],
    subject: sender,
  });
  try {
    await auth.authorize();
    const token = (await auth.getAccessToken()).token;
    const url = `https://chat.googleapis.com/v1/spaces:findDirectMessage?name=${encodeURIComponent('users/' + recipient)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.text();
    return { sender, recipient, status: res.status, body: body.slice(0, 150) };
  } catch (e) {
    return { sender, recipient, authError: e.message.slice(0, 120) };
  }
}

for (const s of SENDERS) {
  for (const r of RECIPIENTS) {
    const result = await checkDM(s, r);
    console.log(JSON.stringify(result));
  }
}
