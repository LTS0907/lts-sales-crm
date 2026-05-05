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

  const targets = [
    { id: '1MIpUUNL_1Dr7yIWkFXRFpu-lAIdIomIRbKl5JsjBNEo', name: 'LTS月次推移', isGoogle: true },
    { id: '1WJCTlK6AYIVY8ssKmZQzheavM_efH0N2lb2mrR5caps', name: 'NK月次推移', isGoogle: true },
    { id: '12VMFwFF-nsjC2n7c5J9NdeGohhJJgaFj', name: 'LTS経営計画書', isGoogle: false },
  ];

  for (const t of targets) {
    console.log(`\n=== ${t.name} ===`);
    const dest = `/Users/apple/scripts/ai-employee/k.ryochiku/tmp/notion-meeting/${t.name}.xlsx`;
    try {
      let r;
      if (t.isGoogle) {
        r = await drive.files.export({ fileId: t.id, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, { responseType: 'stream' });
      } else {
        r = await drive.files.get({ fileId: t.id, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
      }
      const out = fs.createWriteStream(dest);
      await new Promise((resolve, reject) => {
        r.data.on('end', resolve).on('error', reject).pipe(out);
      });
      console.log('  exported to', dest, fs.statSync(dest).size, 'bytes');
    } catch (e) {
      console.log('ERROR:', e.message.substring(0, 250));
    }
  }
})();
