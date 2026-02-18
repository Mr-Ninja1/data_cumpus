const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = {};
  argv.forEach(arg => {
    if (!arg.startsWith('--')) return;
    const [k, v] = arg.slice(2).split('=');
    out[k] = v ?? true;
  });
  return out;
}

(async () => {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/bulk-upload.js <directory> --school=... --program=... --year=... --type=...');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(3));
  const school = args.school || args.s || 'unknown';
  const program = args.program || args.p || 'unknown';
  const year = args.year || args.y || 'unknown';
  const type = args.type || 'paper';

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.');
    process.exit(1);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = entries
    .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.pdf'))
    .map(e => e.name);

  if (files.length === 0) {
    console.log('No PDF files found in', dir);
    return;
  }

  for (const file of files) {
    try {
      const full = path.join(dir, file);
      const safeName = file.replace(/\s+/g, '_');
      const storagePath = `${school}/${program}/${year}/${Date.now()}_${safeName}`;
      console.log('Uploading', file, '->', storagePath);

      const fileStream = fs.createReadStream(full);
      const { data: uploadData, error: uploadError } = await supabase.storage.from('papers').upload(storagePath, fileStream, {
        upsert: false,
        contentType: 'application/pdf',
      });

      if (uploadError) {
        console.error('Upload failed for', file, uploadError);
        continue;
      }

      const title = path.basename(file, path.extname(file));
      const { data: insertData, error: insertError } = await supabase.from('papers').insert([
        {
          school,
          program,
          type,
          title,
          file_path: storagePath,
        },
      ]);

      if (insertError) console.error('DB insert failed for', file, insertError);
      else console.log('Inserted DB row for', file);
    } catch (err) {
      console.error('Error processing', file, err);
    }
  }

  console.log('Bulk upload finished.');
})();
