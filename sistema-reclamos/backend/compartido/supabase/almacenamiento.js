// Se aceptan dos formas porque las filas viejas quedaron con el marcador
// '/object/public/', que era engañoso: sugería que el archivo era público (no lo
// es, la ruta devuelve "Bucket not found"). Las nuevas usan '/object/'. Se prueba
// primero el marcador largo, porque '/object/' también casa dentro de él.
const STORAGE_MARKERS = ['/object/public/', '/object/'];

export function parseStorageRef(storedUrl) {
  if (typeof storedUrl !== 'string') return null;
  for (const marker of STORAGE_MARKERS) {
    const idx = storedUrl.indexOf(marker);
    if (idx === -1) continue;
    const [bucket, ...rest] = storedUrl.slice(idx + marker.length).split('/');
    if (!bucket || rest.length === 0) continue;
    return { bucket: decodeURIComponent(bucket), path: rest.map(decodeURIComponent).join('/') };
  }
  return null;
}

export async function deleteStorageFile(storedUrl) {
  const ref = parseStorageRef(storedUrl);
  if (!ref) throw new Error(`No se pudo interpretar la referencia de archivo: ${storedUrl}`);
  const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(ref.bucket)}/${ref.path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'DELETE',
    headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}` }
  });
  if (!res.ok) throw new Error(`Error borrando el archivo: ${storedUrl}`);
}

export async function createSignedUrl(storedUrl, expiresIn = 600) {
  const ref = parseStorageRef(storedUrl);
  if (!ref) throw new Error('Referencia de archivo inválida');
  const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(ref.bucket)}/${ref.path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    },
    body: JSON.stringify({ expiresIn })
  });
  if (!res.ok) throw new Error(`No se pudo firmar la URL del archivo: ${storedUrl}`);
  const data = await res.json();
  return `${process.env.SUPABASE_URL}/storage/v1${data.signedURL}`;
}

export function referenciaDeArchivo(bucket, objectPath) {
  return `${process.env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath}`;
}

export function subirArchivo(bucket, objectPath, archivo) {
  const pathCodificado = objectPath.split('/').map(encodeURIComponent).join('/');
  return fetch(referenciaDeArchivo(bucket, pathCodificado), {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': archivo.mimetype,
      'x-upsert': 'true',
    },
    body: archivo.buffer,
  });
}
