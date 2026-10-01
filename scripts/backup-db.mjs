/* global process, console, URL, Headers, fetch */
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gzip as gzipCallback } from 'node:zlib';
import { promisify as promisifyFn } from 'node:util';
import { Client } from 'pg';

const exec = promisify(execFile);
const gzip = promisifyFn(gzipCallback);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

function hmac(key, data, encoding) {
  return createHmac('sha256', key).update(data).digest(encoding);
}

function awsSignatureKey(secret, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function encodePath(path) {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function canonicalQuery(params) {
  return Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`)
    .join('&');
}

async function signedB2Request({ method, path, query = {}, headers = {}, body = undefined }) {
  const endpoint = new URL(required('B2_BACKUP_ENDPOINT'));
  if (endpoint.protocol !== 'https:') throw new Error('b2_backup_endpoint_must_be_https');

  const region = required('B2_BACKUP_REGION');
  const accessKey = required('B2_BACKUP_KEY_ID');
  const secret = required('B2_BACKUP_APPLICATION_KEY');
  const service = 's3';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = body instanceof Uint8Array ? sha256Hex(body) : 'UNSIGNED-PAYLOAD';
  const targetPath = path.startsWith('/') ? path : `/${path}`;
  const canonicalUri = encodePath(targetPath);
  const canonicalQs = canonicalQuery(query);
  const host = endpoint.host;
  const signedHeaders = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...headers,
  };
  const headerEntries = Object.entries(signedHeaders)
    .map(([k, v]) => [k.toLowerCase().trim(), String(v).trim().replace(/\s+/g, ' ')])
    .sort(([a], [b]) => a.localeCompare(b));
  const canonicalHeaders = headerEntries.map(([k, v]) => `${k}:${v}\n`).join('');
  const signedHeaderNames = headerEntries.map(([k]) => k).join(';');

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQs,
    canonicalHeaders,
    signedHeaderNames,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = awsSignatureKey(secret, dateStamp, region, service);
  const signature = hmac(signingKey, stringToSign, 'hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`;

  const requestHeaders = new Headers();
  for (const [key, value] of Object.entries(signedHeaders)) requestHeaders.set(key, value);
  requestHeaders.set('Authorization', authorization);
  if (!requestHeaders.has('content-type') && body !== undefined) requestHeaders.set('content-type', 'application/octet-stream');

  const url = new URL(endpoint);
  url.pathname = canonicalUri;
  url.search = canonicalQs ? `?${canonicalQs}` : '';

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body instanceof Uint8Array ? body : undefined,
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`b2_backup_http_${response.status}:${text.slice(0, 500)}`);
  return { response, text };
}

async function uploadObject(filePath, objectKey) {
  const bytes = await readFile(filePath);
  await signedB2Request({
    method: 'PUT',
    path: objectKey,
    headers: {
      'content-length': String(bytes.byteLength),
    },
    body: bytes,
  });
  return bytes.byteLength;
}

async function listObjects(prefix) {
  const objects = [];
  let continuationToken;
  do {
    const query = {
      'list-type': '2',
      'max-keys': '1000',
      prefix,
      ...(continuationToken ? { 'continuation-token': continuationToken } : {}),
    };
    const result = await signedB2Request({ method: 'GET', path: '/', query });
    const contents = [...result.text.matchAll(/<Contents>.*?<Key>(.*?)<\/Key>.*?<LastModified>(.*?)<\/LastModified>.*?<Size>(\d+)<\/Size>.*?<\/Contents>/gs)]
      .map((match) => ({ key: match[1], lastModified: new Date(match[2]), size: Number(match[3]) }));
    objects.push(...contents);
    const next = result.text.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/s);
    continuationToken = next?.[1] ?? undefined;
  } while (continuationToken);
  return objects;
}

async function deleteObject(key) {
  await signedB2Request({ method: 'DELETE', path: key });
}

async function main() {
  const startedAt = new Date();
  const runId = randomUUID();
  const tempDir = '/tmp/prively-backup';
  await mkdir(tempDir, { recursive: true });

  const projectRef = required('SUPABASE_PROJECT_REF');
  const dbPassword = required('SUPABASE_DB_PASSWORD');
  const dbHost = process.env.SUPABASE_DB_HOST || `db.${projectRef}.supabase.co`;
  const dbName = process.env.SUPABASE_DB_NAME || 'postgres';
  const dbUser = process.env.SUPABASE_DB_USER || 'postgres';
  const timestamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const dumpPath = `${tempDir}/prively-${projectRef}-${timestamp}.dump`;
  const backupPath = `${dumpPath}.gz`;
  const objectKey = `postgres/${startedAt.toISOString().slice(0, 10)}/${runId}-${process.env.GITHUB_SHA || 'manual'}.dump.gz`;

  const db = new Client({
    host: dbHost,
    port: Number(process.env.SUPABASE_DB_PORT || 5432),
    user: dbUser,
    password: dbPassword,
    database: dbName,
    ssl: { rejectUnauthorized: true },
  });

  await db.connect();
  await db.query(
    'insert into public.backup_runs(id,started_at,status) values($1,$2,$3)',
    [runId, startedAt, 'running'],
  );

  try {
    const connectionUri = new URL(`postgresql://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword)}@${dbHost}:${process.env.SUPABASE_DB_PORT || 5432}/${dbName}`);
    connectionUri.searchParams.set('sslmode', 'verify-full');

    await exec('pg_dump', [
      '--format=custom',
      '--no-owner',
      '--no-acl',
      '--dbname', connectionUri.toString(),
      '--file', dumpPath,
    ], { maxBuffer: 10 * 1024 * 1024 });

    const dump = await readFile(dumpPath);
    const compressed = await gzip(dump, { level: 9 });
    await import('node:fs/promises').then(({ writeFile }) => writeFile(backupPath, compressed));

    const sizeBytes = (await stat(backupPath)).size;
    await uploadObject(backupPath, objectKey);

    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const oldObjects = (await listObjects('postgres/')).filter((object) => object.lastModified.getTime() < cutoff);
    for (const object of oldObjects) await deleteObject(object.key);

    await db.query(
      'update public.backup_runs set completed_at=now(),size_bytes=$2,status=$3,storage_path=$4,error_message=null where id=$1',
      [runId, sizeBytes, 'succeeded', objectKey],
    );

    console.log(JSON.stringify({
      ok: true,
      runId,
      storagePath: objectKey,
      sizeBytes,
      deletedExpiredBackups: oldObjects.length,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.query(
      'update public.backup_runs set completed_at=now(),status=$2,error_message=$3 where id=$1',
      [runId, 'failed', message.slice(0, 2000)],
    );
    throw error;
  } finally {
    await db.end();
    await Promise.allSettled([unlink(dumpPath), unlink(backupPath)]);
  }
}

await main();
