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

  // 2 subfolders
  const subs = [
    { id: '1ffC3na5NOHR3CRt-3zlk1FTTalk2QFIO', name: 'LMにアップ済み' },
    { id: '17P68UN4819o-k4ysCBm-X2jH7iSymN2R', name: '録画動画' },
  ];

  for (const sub of subs) {
    console.log(`\n===== ${sub.name} =====`);
    const r = await drive.files.list({
      q: `'${sub.id}' in parents and trashed = false`,
      fields: 'files(id,name,mimeType,modifiedTime)',
      pageSize: 200,
      corpora: 'allDrives',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      orderBy: 'modifiedTime desc',
    });
    console.log(`Found ${r.data.files?.length || 0} items`);
    for (const f of r.data.files || []) {
      console.log(' -', f.name, '|', f.mimeType, '|', f.modifiedTime?.substring(0,10), '|', f.id);
    }
  }
})();
