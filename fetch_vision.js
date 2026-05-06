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

  const fileId = '1SyaaFWcprF9aB7i6NG6rt-vy4Sqg1LqT';
  const meta = await drive.files.get({
    fileId,
    fields: 'id,name,mimeType,size',
    supportsAllDrives: true,
  });
  console.log('File:', meta.data.name, '|', meta.data.mimeType, '|', meta.data.size, 'bytes');

  const dest = '/Users/apple/scripts/ai-employee/k.ryochiku/tmp/lts-group-vision.pdf';
  const out = fs.createWriteStream(dest);
  const r = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );
  await new Promise((resolve, reject) => {
    r.data.on('end', resolve).on('error', reject).pipe(out);
  });
  console.log('Saved to:', dest, fs.statSync(dest).size, 'bytes');
})();
