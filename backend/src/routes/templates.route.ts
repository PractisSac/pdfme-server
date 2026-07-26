import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

import { authenticateApiKey } from '../services/api-credentials.service.js';
import { CannotDeleteTemplateVersionError, createTemplate, createTemplateVersion, deleteTemplate, deleteTemplateVersion, duplicateTemplate, getTemplateByCode, listTemplateCatalog, setCurrentTemplateVersion, updateTemplateDetails, updateTemplatePageSettings, updateTemplateSchemaLocks } from '../services/templates.service.js';
import { requirePermission } from '../middleware/session-auth.js';
import { prisma } from '../prisma.js';
import { logAuditEvent, getSpanishRole } from '../services/audit.service.js';
import { inspectTemplateInputs } from '../services/render.service.js';

export const templatesRouter = Router();

const createTemplateSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(3).regex(/^[a-z0-9_]+$/).optional(),
  tagNames: z.array(z.string().min(1)).optional(),
});

const updatePageSettingsSchema = z.object({
  pageFormat: z.enum(['A4', 'LETTER', 'LEGAL', 'CUSTOM']),
  pageOrientation: z.enum(['PORTRAIT', 'LANDSCAPE']),
  pageWidthMm: z.number().positive(),
  pageHeightMm: z.number().positive(),
  designerJson: z.unknown().optional(),
});

const updateTemplateDetailsSchema = z.object({
  name: z.string().min(2).optional(),
  code: z.string().min(3).regex(/^[a-z0-9_]+$/).optional(),
  tagNames: z.array(z.string().min(1)).optional(),
});

const updateSchemaLocksSchema = z.object({
  lockedSchemaNames: z.array(z.string().min(1)),
});

templatesRouter.get('/templates', requirePermission('templates.view'), async (request, response) => {
  response.json({
    data: await listTemplateCatalog({
      search: typeof request.query.search === 'string' ? request.query.search : undefined,
      tag: typeof request.query.tag === 'string' ? request.query.tag : undefined,
    }),
  });
});

templatesRouter.get('/templates/by-code/:code', requirePermission('templates.view'), async (request, response) => {
  try {
    response.json({ template: await getTemplateByCode(request.params.code) });
  } catch {
    response.status(404).json({ message: 'No se encontro la plantilla.' });
  }
});

templatesRouter.post('/templates', requirePermission('templates.create'), async (request, response) => {
  const parsed = createTemplateSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: 'Datos invalidos para crear la plantilla.' });
    return;
  }

  try {
    const template = await createTemplate({
      name: parsed.data.name,
      code: parsed.data.code,
      tagNames: parsed.data.tagNames,
      createdById: response.locals.user?.id === 'bootstrap-admin' ? null : response.locals.user?.id ?? null,
    });

    const actor = response.locals.user;
    const actorRole = getSpanishRole(actor?.roles, actor?.isSuperAdmin);
    const detail = `El ${actorRole.toLowerCase()} ${actor?.displayName || 'Desconocido'} ha creado la plantilla "${template.name}"`;
    await logAuditEvent({
      actorId: actor?.id ?? null,
      action: 'Crear plantilla',
      entityType: 'TEMPLATE',
      entityId: template.id,
      metadata: {
        detail,
        actorName: actor?.displayName || 'Desconocido',
        actorRole,
        templateName: template.name,
        templateCode: template.code,
        versionNumber: 1,
      }
    });

    response.status(201).json({ ok: true, template });
  } catch {
    response.status(409).json({ message: 'No se pudo crear la plantilla. Revisa que el codigo no exista.' });
  }
});

templatesRouter.post('/templates/:id/duplicate', requirePermission('templates.create'), async (request, response) => {
  try {
    const template = await duplicateTemplate(request.params.id, {
      createdById: response.locals.user?.id ?? null,
    });

    const actor = response.locals.user;
    const actorRole = getSpanishRole(actor?.roles, actor?.isSuperAdmin);
    const detail = `El ${actorRole.toLowerCase()} ${actor?.displayName || 'Desconocido'} ha duplicado la plantilla "${template.name}"`;
    await logAuditEvent({
      actorId: actor?.id ?? null,
      action: 'Duplicar plantilla',
      entityType: 'TEMPLATE',
      entityId: template.id,
      metadata: {
        detail,
        actorName: actor?.displayName || 'Desconocido',
        actorRole,
        templateName: template.name,
        templateCode: template.code,
        versionNumber: template.versionNumber,
      }
    });

    response.status(201).json({ ok: true, template });
  } catch {
    response.status(404).json({ message: 'No se encontro la plantilla para duplicar.' });
  }
});

templatesRouter.patch('/templates/:id', requirePermission('templates.edit'), async (request, response) => {
  const parsed = updateTemplateDetailsSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: 'Datos invalidos para actualizar la plantilla.' });
    return;
  }

  try {
    const template = await updateTemplateDetails(request.params.id, parsed.data);

    const actor = response.locals.user;
    const actorRole = getSpanishRole(actor?.roles, actor?.isSuperAdmin);
    const detail = `El ${actorRole.toLowerCase()} ${actor?.displayName || 'Desconocido'} ha editado la plantilla "${template.name}"`;
    await logAuditEvent({
      actorId: actor?.id ?? null,
      action: 'Editar plantilla',
      entityType: 'TEMPLATE',
      entityId: template.id,
      metadata: {
        detail,
        actorName: actor?.displayName || 'Desconocido',
        actorRole,
        templateName: template.name,
        templateCode: template.code,
        versionNumber: template.versionNumber,
      }
    });

    response.json({ ok: true, template });
  } catch {
    response.status(409).json({ message: 'No se pudo actualizar la plantilla. Revisa que el codigo no exista.' });
  }
});

templatesRouter.patch('/templates/:id/page-settings', requirePermission('templates.edit'), async (request, response) => {
  const parsed = updatePageSettingsSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: 'Datos invalidos para guardar la hoja.' });
    return;
  }

  try {
    const template = await updateTemplatePageSettings(request.params.id, {
      ...parsed.data,
      designerJson: parsed.data.designerJson as Prisma.InputJsonValue | undefined,
    });

    const actor = response.locals.user;
    const actorRole = getSpanishRole(actor?.roles, actor?.isSuperAdmin);
    const detail = `El ${actorRole.toLowerCase()} ${actor?.displayName || 'Desconocido'} ha editado la plantilla "${template.name}"`;
    await logAuditEvent({
      actorId: actor?.id ?? null,
      action: 'Editar plantilla',
      entityType: 'TEMPLATE',
      entityId: template.id,
      metadata: {
        detail,
        actorName: actor?.displayName || 'Desconocido',
        actorRole,
        templateName: template.name,
        templateCode: template.code,
        versionNumber: template.versionNumber,
      }
    });

    response.json({ ok: true, template });
  } catch {
    response.status(404).json({ message: 'No se encontro la plantilla actual.' });
  }
});

templatesRouter.patch('/templates/:id/schema-locks', requirePermission('templates.edit'), async (request, response) => {
  const parsed = updateSchemaLocksSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: 'Datos invalidos para guardar los bloqueos.' });
    return;
  }

  try {
    const template = await updateTemplateSchemaLocks(request.params.id, parsed.data);

    const actor = response.locals.user;
    const actorRole = getSpanishRole(actor?.roles, actor?.isSuperAdmin);
    const detail = `El ${actorRole.toLowerCase()} ${actor?.displayName || 'Desconocido'} ha actualizado los bloqueos de la plantilla "${template.name}"`;
    await logAuditEvent({
      actorId: actor?.id ?? null,
      action: 'Actualizar bloqueos de plantilla',
      entityType: 'TEMPLATE',
      entityId: template.id,
      metadata: {
        detail,
        actorName: actor?.displayName || 'Desconocido',
        actorRole,
        templateName: template.name,
        templateCode: template.code,
        lockedCount: parsed.data.lockedSchemaNames.length,
        versionNumber: template.versionNumber,
      }
    });

    response.json({ ok: true, template });
  } catch {
    response.status(404).json({ message: 'No se encontro la plantilla actual.' });
  }
});

templatesRouter.post('/templates/:id/versions', requirePermission('templates.edit'), async (request, response) => {
  try {
    const template = await createTemplateVersion(request.params.id, response.locals.user?.id ?? null);

    const actor = response.locals.user;
    const actorRole = getSpanishRole(actor?.roles, actor?.isSuperAdmin);
    const detail = `El ${actorRole.toLowerCase()} ${actor?.displayName || 'Desconocido'} ha creado una nueva versión de la plantilla "${template.name}"`;
    await logAuditEvent({
      actorId: actor?.id ?? null,
      action: 'Editar plantilla',
      entityType: 'TEMPLATE',
      entityId: template.id,
      metadata: {
        detail,
        actorName: actor?.displayName || 'Desconocido',
        actorRole,
        templateName: template.name,
        templateCode: template.code,
        versionNumber: template.versionNumber,
      }
    });

    response.status(201).json({ ok: true, template });
  } catch {
    response.status(404).json({ message: 'No se encontro la plantilla actual.' });
  }
});

templatesRouter.patch('/templates/:id/versions/:versionId/current', requirePermission('templates.edit'), async (request, response) => {
  try {
    const template = await setCurrentTemplateVersion(request.params.id, request.params.versionId);

    const actor = response.locals.user;
    const actorRole = getSpanishRole(actor?.roles, actor?.isSuperAdmin);
    const detail = `El ${actorRole.toLowerCase()} ${actor?.displayName || 'Desconocido'} ha cambiado la versión activa de la plantilla "${template.name}"`;
    await logAuditEvent({
      actorId: actor?.id ?? null,
      action: 'Editar plantilla',
      entityType: 'TEMPLATE',
      entityId: template.id,
      metadata: {
        detail,
        actorName: actor?.displayName || 'Desconocido',
        actorRole,
        templateName: template.name,
        templateCode: template.code,
        versionNumber: template.versionNumber,
      }
    });

    response.json({ ok: true, template });
  } catch {
    response.status(404).json({ message: 'No se encontro la version solicitada.' });
  }
});

templatesRouter.delete('/templates/:id/versions/:versionId', requirePermission('templates.edit'), async (request, response) => {
  try {
    const template = await deleteTemplateVersion(request.params.id, request.params.versionId);

    const actor = response.locals.user;
    const actorRole = getSpanishRole(actor?.roles, actor?.isSuperAdmin);
    const detail = `El ${actorRole.toLowerCase()} ${actor?.displayName || 'Desconocido'} ha eliminado una version de la plantilla "${template.name}"`;
    await logAuditEvent({
      actorId: actor?.id ?? null,
      action: 'Eliminar version de plantilla',
      entityType: 'TEMPLATE',
      entityId: template.id,
      metadata: {
        detail,
        actorName: actor?.displayName || 'Desconocido',
        actorRole,
        templateName: template.name,
        templateCode: template.code,
        versionNumber: template.versionNumber,
      }
    });

    response.json({ ok: true, template });
  } catch (error) {
    if (error instanceof CannotDeleteTemplateVersionError) {
      response.status(error.message.includes('unica') ? 400 : 404).json({ message: error.message });
      return;
    }
    response.status(404).json({ message: 'No se encontro la version solicitada.' });
  }
});

templatesRouter.delete('/templates/:id', requirePermission('templates.delete'), async (request, response) => {
  try {
    const template = await prisma.template.findUnique({
      where: { id: request.params.id },
      include: {
        versions: {
          where: { isCurrent: true },
        },
      },
    });
    
    await deleteTemplate(request.params.id);

    if (template) {
      const actor = response.locals.user;
      const actorRole = getSpanishRole(actor?.roles, actor?.isSuperAdmin);
      const currentVer = template.versions?.[0]?.versionNumber ?? 1;
      const detail = `El ${actorRole.toLowerCase()} ${actor?.displayName || 'Desconocido'} ha eliminado la plantilla "${template.name}"`;
      await logAuditEvent({
        actorId: actor?.id ?? null,
        action: 'Eliminar plantilla',
        entityType: 'TEMPLATE',
        entityId: template.id,
        metadata: {
          detail,
          actorName: actor?.displayName || 'Desconocido',
          actorRole,
          templateName: template.name,
          templateCode: template.code,
          versionNumber: currentVer,
        }
      });
    }

    response.json({ ok: true });
  } catch {
    response.status(404).json({ message: 'No se encontro la plantilla.' });
  }
});

templatesRouter.get('/v1/templates', async (request, response) => {
  const credential = await authenticateApiKey(String(request.header('x-api-key') ?? ''), {
    origin: request.header('origin'),
    ip: request.ip,
  });

  if (!credential) {
    response.status(401).json({ message: 'API key invalida.' });
    return;
  }

  response.json({ data: await listTemplateCatalog() });
});

templatesRouter.get('/v1/templates/:code/inputs', async (request, response) => {
  const credential = await authenticateApiKey(String(request.header('x-api-key') ?? ''), {
    origin: request.header('origin'),
    ip: request.ip,
  });

  if (!credential) {
    response.status(401).json({ message: 'API key invalida.' });
    return;
  }

  const result = await inspectTemplateInputs(request.params.code);
  if (!result.ok) {
    response.status(result.status).json({ message: result.message });
    return;
  }

  response.json({ template: result.template, inputs: result.inputs, conventions: result.conventions });
});
