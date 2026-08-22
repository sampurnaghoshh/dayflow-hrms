/**
 * Wiring only: no logic, no SQL.
 *
 * Exports two routers because §6 puts document downloads at /documents/:id/download,
 * outside the /employees tree.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { DOCUMENT_TYPES, IMAGE_TYPES, uploadSingle } from '../../middleware/upload.js';
import { notFound } from '../../lib/errors.js';
import {
  documentIdParamSchema,
  documentUploadSchema,
  employeeIdParamSchema,
  listEmployeesQuerySchema,
  patchEmployeeSchema,
} from './employees.schema.js';
import * as service from './employees.service.js';

export const router = Router();
export const documentsRouter = Router();

router.use(requireAuth);
documentsRouter.use(requireAuth);

// The caller's IP reaches the service only so audit_log can record it.
const withIp = (req) => ({ ...req.user, ipAddress: req.ip });

const photoUpload = uploadSingle({
  field: 'photo',
  maxBytes: 2 * 1024 * 1024, // 2MB (§6)
  allowed: IMAGE_TYPES,
  subdir: 'photos',
});

const documentUpload = uploadSingle({
  field: 'document',
  maxBytes: 5 * 1024 * 1024, // 5MB, matching the size_bytes CHECK on employee_documents
  allowed: DOCUMENT_TYPES,
  subdir: 'documents',
});

/** Streams a file after the service has already authorised it. */
async function streamFile(res, next, { absolutePath, mimeType, downloadName }) {
  try {
    const info = await stat(absolutePath);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', info.size);
    if (downloadName) {
      // Two forms: a stripped ASCII fallback, plus RFC 5987 for anything non-ASCII.
      const ascii = downloadName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`
      );
    }
    createReadStream(absolutePath).on('error', next).pipe(res);
  } catch {
    // The row survived but the file did not.
    next(notFound('FILE_NOT_FOUND', 'That file is no longer on disk.'));
  }
}

// GET /api/employees?q=&departmentId=&page=&pageSize=   - HR/ADMIN
router.get(
  '/',
  requireRole('HR', 'ADMIN'),
  validate(listEmployeesQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      res.json(await service.listEmployees(req.user, req.query));
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/employees/:id   - self or HR/ADMIN
router.get('/:id', validate(employeeIdParamSchema, 'params'), async (req, res, next) => {
  try {
    res.json(await service.getEmployee(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/employees/:id - self (phone/address) or ADMIN (everything)
router.patch(
  '/:id',
  validate(employeeIdParamSchema, 'params'),
  validate(patchEmployeeSchema),
  async (req, res, next) => {
    try {
      res.json(await service.updateEmployee(withIp(req), req.params.id, req.body));
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/employees/:id/photo  - multipart, <=2MB, jpeg/png
router.post(
  '/:id/photo',
  validate(employeeIdParamSchema, 'params'),
  photoUpload,
  async (req, res, next) => {
    try {
      res.status(201).json(await service.setProfilePhoto(withIp(req), req.params.id, req.file));
    } catch (err) {
      next(err);
    }
  }
);

/*
 * GET /api/employees/:id/photo
 *
 * Not in §6, but profile_photo_path is useless to a client without a way to fetch the
 * bytes, and serving UPLOAD_DIR statically would hand out every photo with no ownership
 * check at all. Same audience as the profile it belongs to.
 */
router.get('/:id/photo', validate(employeeIdParamSchema, 'params'), async (req, res, next) => {
  try {
    const target = await service.getPhotoTarget(req.user, req.params.id);
    await streamFile(res, next, { ...target, downloadName: null });
  } catch (err) {
    next(err);
  }
});

// GET /api/employees/:id/documents  - self or HR/ADMIN
router.get('/:id/documents', validate(employeeIdParamSchema, 'params'), async (req, res, next) => {
  try {
    res.json(await service.listDocuments(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
});

// POST /api/employees/:id/documents - HR/ADMIN, multipart, <=5MB, pdf/jpeg/png
router.post(
  '/:id/documents',
  requireRole('HR', 'ADMIN'),
  validate(employeeIdParamSchema, 'params'),
  documentUpload,
  validate(documentUploadSchema),
  async (req, res, next) => {
    try {
      res.status(201).json(
        await service.addDocument(withIp(req), req.params.id, req.body, req.file)
      );
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/documents/:id/download - authorised only, streamed from disk
documentsRouter.get(
  '/:id/download',
  validate(documentIdParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const { document, absolutePath } = await service.getDownloadTarget(req.user, req.params.id);
      await streamFile(res, next, {
        absolutePath,
        mimeType: document.mime_type,
        downloadName: document.original_name,
      });
    } catch (err) {
      next(err);
    }
  }
);
