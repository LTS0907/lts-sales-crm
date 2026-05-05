const { google } = require('googleapis');
const fs = require('fs');

(async () => {
  const sa = JSON.parse(fs.readFileSync('/Users/apple/.config/gws/service-account.json', 'utf8'));
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    subject: 'ryouchiku@life-time-support.com',
  });
  await auth.authorize();
  const drive = google.drive({ version: 'v3', auth });

  for (const id of ['1E2naT23aKg9KObe7pVGJJ9zObrn5B-J3JXqRCgsRJvg', '1pNgw6Oxj1tNbRpKwJv3VU9tvBZwU3ytpIkdtkwXp8WY']) {
    const meta = await drive.files.get({ fileId: id, fields: 'id,name', supportsAllDrives: true });
    console.log(meta.data.name, '|', id);
    const dest = `/Users/apple/scripts/ai-employee/k.ryochiku/tmp/notion-meeting/${meta.data.name}.xlsx`;
    const out = fs.createWriteStream(dest);
    const r = await drive.files.export({ fileId: id, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, { responseType: 'stream' });
    await new Promise((resolve, reject) => {
      r.data.on('end', resolve).on('error', reject).pipe(out);
    });
    console.log('  exported:', fs.statSync(dest).size, 'bytes');
  }
})();
