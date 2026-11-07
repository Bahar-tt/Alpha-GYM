/**
 * backup.js — بکاپ خودکار دیتابیس
 * - ذخیره local در /var/www/alphagym/backups/
 * - آپلود به Arvan Object Storage
 * - آخر ۷ بکاپ local نگه میداره
 */

const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const http    = require('http');
const crypto  = require('crypto');

const DB_PATH     = path.join(__dirname, 'gym.db');
const BACKUP_DIR  = path.join(__dirname, '..', 'backups');
const MAX_BACKUPS = 7;

// ─── Arvan S3 Config ──────────────────────────────────────────────────────────
const S3_ENDPOINT   = 's3.ir-thr-at1.arvanstorage.ir';
const S3_BUCKET     = 'alphagym-backup';
const S3_ACCESS_KEY = '3a7538c9-4f8d-46b4-a602-9e0a10d448e9';
const S3_SECRET_KEY = 'f8097d46d3a72fd118a294b82644b489c7cd07431195305a0eb36ff2af16fa32';
const S3_REGION     = 'ir-thr-at1';

// ─── AWS Signature v4 ─────────────────────────────────────────────────────────
function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate    = hmac('AWS4' + key, dateStamp);
  const kRegion  = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  const kSigning = hmac(kService, 'aws4_request');
  return kSigning;
}

function uploadToArvan(filePath, fileName) {
  return new Promise((resolve, reject) => {
    const fileContent = fs.readFileSync(filePath);
    const fileSize    = fileContent.length;

    const now         = new Date();
    const amzDate     = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
    const dateStamp   = amzDate.slice(0, 8);

    const method      = 'PUT';
    const objectKey   = `backups/${fileName}`;
    const host        = `${S3_BUCKET}.${S3_ENDPOINT}`;
    const contentType = 'application/octet-stream';

    const payloadHash = crypto.createHash('sha256').update(fileContent).digest('hex');

    const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders    = 'content-type;host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = [
      method,
      `/${objectKey}`,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${S3_REGION}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const signingKey = getSignatureKey(S3_SECRET_KEY, dateStamp, S3_REGION, 's3');
    const signature  = hmac(signingKey, stringToSign).toString('hex');

    const authHeader = `AWS4-HMAC-SHA256 Credential=${S3_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const options = {
      hostname: host,
      port: 443,
      path: `/${objectKey}`,
      method: 'PUT',
      headers: {
        'Content-Type':          contentType,
        'Content-Length':        fileSize,
        'x-amz-date':            amzDate,
        'x-amz-content-sha256':  payloadHash,
        'Authorization':         authHeader,
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve(true);
        } else {
          reject(new Error(`S3 upload failed: ${res.statusCode} ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(fileContent);
    req.end();
  });
}

// ─── Main backup function ─────────────────────────────────────────────────────
async function runBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    if (!fs.existsSync(DB_PATH)) {
      console.error('[BACKUP] ❌ Database not found:', DB_PATH);
      return false;
    }

    const now       = new Date();
    const timestamp = now.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
    const fileName  = `gym_${timestamp}.db`;
    const backupFile = path.join(BACKUP_DIR, fileName);

    // ۱. ذخیره local
    fs.copyFileSync(DB_PATH, backupFile);
    console.log(`[BACKUP] ✅ Local saved: ${backupFile}`);

    // ۲. آپلود به آروان
    try {
      await uploadToArvan(backupFile, fileName);
      console.log(`[BACKUP] ☁️  Arvan uploaded: ${fileName}`);
    } catch (uploadErr) {
      console.error('[BACKUP] ⚠️  Arvan upload failed:', uploadErr.message);
      // ادامه میده حتی اگه آپلود fail شه
    }

    // ۳. حذف بکاپ‌های قدیمی local
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('gym_') && f.endsWith('.db'))
      .sort();

    if (files.length > MAX_BACKUPS) {
      const toDelete = files.slice(0, files.length - MAX_BACKUPS);
      toDelete.forEach((f) => {
        fs.unlinkSync(path.join(BACKUP_DIR, f));
        console.log(`[BACKUP] 🗑  Deleted: ${f}`);
      });
    }

    console.log(`[BACKUP] 📦 Total local backups: ${Math.min(files.length, MAX_BACKUPS)}`);
    return true;

  } catch (err) {
    console.error('[BACKUP] ❌ Error:', err);
    return false;
  }
}

if (require.main === module) {
  console.log('[BACKUP] Running manual backup...');
  runBackup().then(() => process.exit(0));
}

module.exports = { runBackup };