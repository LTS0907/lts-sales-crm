import { google } from 'googleapis';
import fs from 'node:fs';

const creds = JSON.parse(fs.readFileSync('/Users/apple/.config/gws/service-account.json', 'utf8'));
const SENDER = 'cs@life-time-support.com';
const MEMBERS = ['ryouchiku@life-time-support.com', 'r.kabashima@life-time-support.com'];

async function main() {
  console.log('🔐 認証中...');
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [
      'https://www.googleapis.com/auth/chat.spaces.create',
      'https://www.googleapis.com/auth/chat.spaces',
      'https://www.googleapis.com/auth/chat.memberships',
    ],
    subject: SENDER,
  });
  await auth.authorize();
  const token = (await auth.getAccessToken()).token;
  console.log('✅ 認証OK\n');

  console.log('🏗 スペース作成中...');
  const url = 'https://chat.googleapis.com/v1/spaces:setup';
  const body = {
    space: {
      spaceType: 'SPACE',
      displayName: 'LTS開発サポート',
      spaceDetails: {
        description: 'CRMサポート問い合わせ・タスク引き渡し通知の集約スペース',
      },
    },
    memberships: MEMBERS.map(email => ({
      member: { name: `users/${email}`, type: 'HUMAN' },
    })),
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  console.log('status:', res.status);
  console.log('response:', text.slice(0, 600));
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
