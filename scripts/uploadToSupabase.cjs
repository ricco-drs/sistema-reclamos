const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://hxwioaetzplxcivlbrwy.supabase.co';
const supabaseKey = 'sb_publishable_XTUuXoD22c9xpEBfcjUdtA_lRgBhqJE';
const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadFiles() {
  try {
    const file1Path = 'reglamento-de-matricula-29-03-2022.pdf';
    const file1Buffer = fs.readFileSync(file1Path);
    console.log('Uploading reglamento...');
    const res1 = await supabase.storage.from('tefiis-docs').upload('Reglamento de Matrícula.pdf', file1Buffer, { contentType: 'application/pdf', upsert: true });
    if (res1.error) console.error(res1.error);
    else console.log('✅ Reglamento de Matrícula uploaded.');

    const file2Path = '4526336-estatuto-uni-2014-06-06-2025.pdf';
    const file2Buffer = fs.readFileSync(file2Path);
    console.log('Uploading estatuto...');
    const res2 = await supabase.storage.from('tefiis-docs').upload('Estatuto UNI.pdf', file2Buffer, { contentType: 'application/pdf', upsert: true });
    if (res2.error) console.error(res2.error);
    else console.log('✅ Estatuto UNI uploaded.');

  } catch (error) {
    console.error('Error during upload:', error);
  }
}

uploadFiles();
