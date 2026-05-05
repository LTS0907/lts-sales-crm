const { google } = require('googleapis');
const fs = require('fs');

(async () => {
  const sa = JSON.parse(fs.readFileSync('/Users/apple/.config/gws/service-account.json', 'utf8'));
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
    subject: 'ryouchiku@life-time-support.com',
  });
  await auth.authorize();
  const drive = google.drive({ version: 'v3', auth });

  const fileId = '16X5Z8oqB-kVwj9MAbQbckDLQnPbQ5_3R';
  const dest = '/Users/apple/scripts/ai-employee/k.ryochiku/tmp/5y-financial/LTS_7期_決算書.pdf';
  const out = fs.createWriteStream(dest);
  const r = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );
  await new Promise((resolve, reject) => {
    r.data.on('end', resolve).on('error', reject).pipe(out);
  });
  console.log('downloaded:', dest);
})();
