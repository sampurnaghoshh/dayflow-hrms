/**
 * File uploads (CLAUDE.md §8: MIME allowlist, size cap, random stored filename).
 *
 * Three rules, all of which matter:
 *
 *  - The stored filename is random. `originalname` is attacker-controlled and may
 *    contain '../', a null byte, or a name that collides with someone else's file.
 *    It is kept in the database as a label and never used to address the disk.
 *  - The extension comes from the ALLOWED map, not from the uploaded name, so
 *    'invoice.pdf.exe' cannot become an .exe on disk.
 *  - The declared MIME type is checked against the file's own magic bytes after the
 *    write. Content-Type is supplied by the client and is trivially forged; without
 *    this the allowlist only filters honest uploads.
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { badRequest, unprocessable } from '../lib/errors.js';

/** mime -> { ext, magic } . magic is the leading byte signature of a real file. */
const SIGNATURES = {
  'image/jpeg': { ext: '.jpg', magic: [0xff, 0xd8, 0xff] },
  'image/png': { ext: '.png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  'application/pdf': { ext: '.pdf', magic: [0x25, 0x50, 0x44, 0x46] }, // '%PDF'
};

export const IMAGE_TYPES = ['image/jpeg', 'image/png'];
export const DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

/** Reads the first bytes off disk and compares them to the signature for `mime`. */
async function hasMatchingMagicBytes(filePath, mime) {
  const signature = SIGNATURES[mime]?.magic;
  if (!signature) return false;

  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(signature.length);
    const { bytesRead } = await handle.read(buffer, 0, signature.length, 0);
    if (bytesRead < signature.length) return false;
    return signature.every((byte, i) => buffer[i] === byte);
  } finally {
    await handle.close();
  }
}

/**
 * Builds a single-file upload middleware.
 *
 * @param {object} opts
 * @param {string} opts.field     multipart field name
 * @param {number} opts.maxBytes  hard size cap, enforced by multer as it streams
 * @param {string[]} opts.allowed permitted MIME types
 * @param {string} opts.subdir    directory under UPLOAD_DIR
 */
export function uploadSingle({ field, maxBytes, allowed, subdir }) {
  const destination = path.join(env.UPLOAD_DIR, subdir);

  const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
      try {
        await mkdir(destination, { recursive: true });
        cb(null, destination);
      } catch (err) {
        cb(err);
      }
    },
    filename: (req, file, cb) => {
      // Random name, extension chosen by us from the declared type.
      const ext = SIGNATURES[file.mimetype]?.ext ?? '.bin';
      cb(null, `${randomBytes(16).toString('hex')}${ext}`);
    },
  });

  const handler = multer({
    storage,
    limits: { fileSize: maxBytes, files: 1, fields: 10 },
    fileFilter: (req, file, cb) => {
      if (!allowed.includes(file.mimetype)) {
        cb(
          unprocessable(
            'UNSUPPORTED_FILE_TYPE',
            `Only ${allowed.join(', ')} files are accepted.`,
            [{ field, issue: `Received ${file.mimetype}` }]
          )
        );
        return;
      }
      cb(null, true);
    },
  }).single(field);

  return function uploadMiddleware(req, res, next) {
    handler(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return next(
              unprocessable(
                'FILE_TOO_LARGE',
                `That file is larger than the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`,
                [{ field, issue: 'Choose a smaller file' }]
              )
            );
          }
          return next(badRequest('UPLOAD_FAILED', `Upload rejected: ${err.code}`));
        }
        return next(err);
      }

      if (!req.file) {
        return next(badRequest('FILE_REQUIRED', `A file is required in the "${field}" field.`));
      }

      // The declared type got the file this far; now make it prove itself.
      try {
        if (!(await hasMatchingMagicBytes(req.file.path, req.file.mimetype))) {
          await unlink(req.file.path).catch(() => {});
          return next(
            unprocessable(
              'FILE_CONTENT_MISMATCH',
              `That file is not a valid ${req.file.mimetype}.`,
              [{ field, issue: 'The file contents do not match its declared type' }]
            )
          );
        }
      } catch (verifyErr) {
        await unlink(req.file.path).catch(() => {});
        return next(verifyErr);
      }

      // Stored relative to UPLOAD_DIR, so the column stays valid if the directory moves.
      req.file.relativePath = path.relative(env.UPLOAD_DIR, req.file.path).split(path.sep).join('/');
      req.file.sha256 = createHash('sha256').update(req.file.filename).digest('hex').slice(0, 16);
      return next();
    });
  };
}

/**
 * Resolves a stored relative path back to an absolute one, refusing anything that
 * escapes UPLOAD_DIR. The column is written by us, but a download route that trusts a
 * database string to build a filesystem path is one bad migration away from serving
 * /etc/passwd.
 */
export function resolveStoredPath(relativePath) {
  const absolute = path.resolve(env.UPLOAD_DIR, relativePath);
  const root = path.resolve(env.UPLOAD_DIR);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw badRequest('INVALID_FILE_PATH', 'That file path is not valid.');
  }
  return absolute;
}
