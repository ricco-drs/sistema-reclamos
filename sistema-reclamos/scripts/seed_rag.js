import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.VITE_API_KEY });

// La carpeta es la única fuente de verdad de lo que Tefi sabe. Cada corrida
// construye un store nuevo con exactamente lo que hay aquí y descarta el
// anterior, de modo que borrar un PDF derogado y reindexar lo elimina de verdad
// del conocimiento de Tefi. La API de Gemini no permite listar los documentos de
// un store, así que reconstruir es la única forma fiable de quitar algo.
const docsFolder = './documentos_entrenamiento';

// El id del store vive en app_settings, no en un archivo del repo: así el
// backend lo recoge solo y actualizar un reglamento no obliga a redesplegar.
const RAG_STORE_KEY = 'rag_store_name';

const EXTENSIONES = { '.pdf': 'application/pdf' };

// El SDK no expone el parámetro force, y la API rechaza borrar un store que
// tenga documentos dentro sin él. Se intenta por SDK y se cae a REST.
async function borrarStore(nombre) {
    try {
        await ai.fileSearchStores.delete({ name: nombre });
        return true;
    } catch {
        const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/${nombre}?force=true`,
            { method: 'DELETE', headers: { 'x-goog-api-key': process.env.VITE_API_KEY } },
        );
        if (!r.ok) throw new Error(await r.text());
        return true;
    }
}

function requerirEnv(nombre) {
    const valor = process.env[nombre];
    if (!valor) {
        console.error(`Falta ${nombre} en el .env — sin eso no puedo guardar el id del store.`);
        process.exit(1);
    }
    return valor;
}

async function supabase(ruta, opciones = {}) {
    const url = requerirEnv('SUPABASE_URL');
    const key = requerirEnv('SUPABASE_SERVICE_KEY');
    return fetch(`${url}/rest/v1${ruta}`, {
        ...opciones,
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            ...opciones.headers,
        },
    });
}

async function leerStoreGuardado() {
    const r = await supabase(`/app_settings?select=value&key=eq.${RAG_STORE_KEY}`);
    if (r.ok) {
        const filas = await r.json();
        const valor = filas?.[0]?.value;
        if (typeof valor === 'string' && valor.trim()) return valor.trim();
    }
    // Primera corrida tras el cambio: el id todavía vive en el archivo heredado.
    // Leerlo aquí evita dejar ese store colgando sin que nadie lo apunte.
    const heredado = './backend/.rag_store_id';
    if (fs.existsSync(heredado)) {
        const valor = fs.readFileSync(heredado, 'utf8').trim();
        if (valor) return valor;
    }
    return null;
}

async function guardarStore(nombre) {
    const r = await supabase('/app_settings?on_conflict=key', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
            key: RAG_STORE_KEY,
            value: nombre,
            updated_at: new Date().toISOString(),
        }),
    });
    if (!r.ok) throw new Error(`No se pudo guardar el id del store: ${await r.text()}`);
}

async function entrenarRAG() {
    console.log('Reconstruyendo el conocimiento de Tefi desde', docsFolder);

    if (!fs.existsSync(docsFolder)) {
        console.error(`No existe la carpeta '${docsFolder}'.`);
        process.exit(1);
    }

    const archivos = fs.readdirSync(docsFolder)
        .filter(f => !f.startsWith('.'))
        .filter(f => EXTENSIONES[path.extname(f).toLowerCase()]);

    if (archivos.length === 0) {
        console.error(`La carpeta '${docsFolder}' no tiene PDFs. Aborto para no dejar a Tefi sin conocimiento.`);
        process.exit(1);
    }

    console.log(`${archivos.length} documentos por indexar.\n`);

    const storeAnterior = await leerStoreGuardado();
    if (storeAnterior) console.log(`Store actual en uso: ${storeAnterior}`);

    // El store nuevo se construye antes de tocar nada: si algo falla a mitad,
    // el backend sigue sirviendo el anterior y Tefi no se queda sin responder.
    const store = await ai.fileSearchStores.create({
        config: { displayName: `tefiis-conocimiento-${new Date().toISOString().slice(0, 10)}` },
    });
    console.log(`Store nuevo: ${store.name}\n`);

    const fallidos = [];
    for (const archivo of archivos) {
        const ruta = path.join(docsFolder, archivo);
        const mimeType = EXTENSIONES[path.extname(archivo).toLowerCase()];
        try {
            process.stdout.write(`  subiendo ${archivo} ... `);
            const subido = await ai.files.upload({ file: ruta, config: { mimeType } });
            await ai.fileSearchStores.importFile({
                fileSearchStoreName: store.name,
                fileName: subido.name,
            });
            console.log('ok');
        } catch (e) {
            console.log(`FALLÓ (${e.message})`);
            fallidos.push(archivo);
        }
    }

    // Cambiar de store dejando documentos fuera daría respuestas incompletas sin
    // que nadie se entere, así que ante cualquier fallo se conserva el anterior.
    if (fallidos.length > 0) {
        console.error(`\nNo se indexaron ${fallidos.length} documentos: ${fallidos.join(', ')}`);
        console.error('No se activa el store nuevo; Tefi sigue con el anterior. Corrige y vuelve a correr.');
        await borrarStore(store.name)
            .catch(() => console.error(`Quedó un store huérfano sin usar: ${store.name}`));
        process.exit(1);
    }

    await guardarStore(store.name);
    console.log(`\nStore activo actualizado en app_settings.`);

    if (storeAnterior && storeAnterior !== store.name) {
        try {
            await borrarStore(storeAnterior);
            console.log(`Store anterior eliminado: ${storeAnterior}`);
        } catch (e) {
            console.warn(`No se pudo borrar el store anterior (${storeAnterior}): ${e.message}`);
        }
    }

    console.log('\nListo. El backend lo recoge solo en menos de 5 minutos, sin redesplegar.');
}

entrenarRAG().catch(e => {
    console.error('Falló el indexado:', e.message);
    process.exit(1);
});
