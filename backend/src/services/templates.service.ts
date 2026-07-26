import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { prisma } from '../prisma.js';

const DEFAULT_DESIGNER_JSON = { schemas: [[]] };
const DEFAULT_INPUT = {};

function slugifyCode(value: string) {
  const base = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);

  return base || 'template';
}

function buildTemplateCode(name: string) {
  return `${slugifyCode(name)}_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

function mapTemplate(template: Prisma.TemplateGetPayload<{
  include: {
    versions: { include: { pages: true } };
    tags: { include: { tag: true } };
  };
}>) {
  const currentVersion = template.versions.find((version) => version.isCurrent) ?? template.versions[0];
  const firstPage = currentVersion?.pages[0];
  const designerJson = currentVersion ? composeDesignerJson(currentVersion.pages) : DEFAULT_DESIGNER_JSON;

  return {
    id: template.id,
    name: template.name,
    code: template.code,
    thumbnailUrl: template.thumbnailUrl,
    status: template.status,
    lastPublishedAt: template.lastPublishedAt?.toISOString() ?? null,
    versionNumber: currentVersion?.versionNumber ?? 0,
    versionId: currentVersion?.id ?? null,
    versions: template.versions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      isCurrent: version.isCurrent,
      isPublished: version.isPublished,
      pageCount: version.pages.length,
      createdAt: version.createdAt.toISOString(),
      updatedAt: version.updatedAt.toISOString(),
    })),
    isPublished: currentVersion?.isPublished ?? false,
    pageCount: currentVersion?.pages.length ?? 0,
    pageFormat: firstPage?.pageFormat ?? 'A4',
    pageOrientation: firstPage?.pageOrientation ?? 'PORTRAIT',
    pageWidthMm: firstPage?.pageWidthMm ?? 210,
    pageHeightMm: firstPage?.pageHeightMm ?? 297,
    paddingVerticalMm: firstPage?.paddingVerticalMm ?? 12,
    paddingHorizontalMm: firstPage?.paddingHorizontalMm ?? 12,
    designerJson,
    tags: template.tags.map((entry) => entry.tag.name),
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

const templateInclude = {
  versions: {
    orderBy: { versionNumber: 'asc' as const },
    include: { pages: { orderBy: { pageNumber: 'asc' as const } } },
  },
  tags: { include: { tag: true } },
};

const templateCatalogInclude = {
  versions: {
    orderBy: { versionNumber: 'asc' as const },
    select: {
      id: true,
      versionNumber: true,
      isCurrent: true,
      isPublished: true,
      createdAt: true,
      updatedAt: true,
      pages: {
        orderBy: { pageNumber: 'asc' as const },
        select: {
          pageFormat: true,
          pageOrientation: true,
          pageWidthMm: true,
          pageHeightMm: true,
          paddingVerticalMm: true,
          paddingHorizontalMm: true,
        },
        take: 1,
      },
      _count: { select: { pages: true } },
    },
  },
  tags: { include: { tag: true } },
};

function mapTemplateCatalogItem(template: Prisma.TemplateGetPayload<{
  include: typeof templateCatalogInclude;
}>) {
  const currentVersion = template.versions.find((version) => version.isCurrent) ?? template.versions[0];
  const firstPage = currentVersion?.pages[0];

  return {
    id: template.id,
    name: template.name,
    code: template.code,
    thumbnailUrl: template.thumbnailUrl,
    status: template.status,
    lastPublishedAt: template.lastPublishedAt?.toISOString() ?? null,
    versionNumber: currentVersion?.versionNumber ?? 0,
    versionId: currentVersion?.id ?? null,
    versions: template.versions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      isCurrent: version.isCurrent,
      isPublished: version.isPublished,
      pageCount: version._count.pages,
      createdAt: version.createdAt.toISOString(),
      updatedAt: version.updatedAt.toISOString(),
    })),
    isPublished: currentVersion?.isPublished ?? false,
    pageCount: currentVersion?._count.pages ?? 0,
    pageFormat: firstPage?.pageFormat ?? 'A4',
    pageOrientation: firstPage?.pageOrientation ?? 'PORTRAIT',
    pageWidthMm: firstPage?.pageWidthMm ?? 210,
    pageHeightMm: firstPage?.pageHeightMm ?? 297,
    paddingVerticalMm: firstPage?.paddingVerticalMm ?? 12,
    paddingHorizontalMm: firstPage?.paddingHorizontalMm ?? 12,
    tags: template.tags.map((entry) => entry.tag.name),
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getSchemaPages(designerJson: unknown) {
  if (!isRecord(designerJson) || !Array.isArray(designerJson.schemas)) return [[]];

  const schemas = designerJson.schemas;

  if (schemas.length === 0) return [[]];

  return schemas.map((pageSchemas) => Array.isArray(pageSchemas) ? pageSchemas : []);
}

function buildPageDesignerJson(designerJson: unknown, pageSchemas: unknown[]) {
  if (!isRecord(designerJson)) {
    return { schemas: [pageSchemas] } as Prisma.InputJsonValue;
  }

  return {
    ...designerJson,
    schemas: [pageSchemas],
  } as Prisma.InputJsonValue;
}

function applySchemaLocksToPageSchemas(pageSchemas: unknown[], pageIndex: number, lockedSchemaNames: Set<string>) {
  return pageSchemas.map((schema) => {
    if (!isRecord(schema)) return schema;

    const schemaName = typeof schema.name === 'string' ? schema.name.trim() : '';
    if (!schemaName) return { ...schema, __isLocked: false };

    return {
      ...schema,
      __isLocked: lockedSchemaNames.has(`${pageIndex}::${schemaName}`),
    };
  });
}

function composeDesignerJson(pages: Prisma.TemplatePageGetPayload<Record<string, never>>[]) {
  const firstPageJson = pages[0]?.designerJson;
  const base = isRecord(firstPageJson) ? firstPageJson : DEFAULT_DESIGNER_JSON;

  return {
    ...base,
    schemas: pages.map((page) => getSchemaPages(page.designerJson)[0] ?? []),
  };
}

export async function listTemplateCatalog(input: { search?: string; tag?: string } = {}) {
  const search = input.search?.trim();
  const tag = input.tag?.trim();
  const where: Prisma.TemplateWhereInput = {
    status: { not: 'ARCHIVED' },
    ...(search ? {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ],
    } : {}),
    ...(tag ? { tags: { some: { tag: { name: tag } } } } : {}),
  };

  const templates = await prisma.template.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: templateCatalogInclude,
  });

  return templates.map(mapTemplateCatalogItem);
}

export async function getTemplateByCode(code: string) {
  const template = await prisma.template.findFirstOrThrow({
    where: { code, status: { not: 'ARCHIVED' } },
    include: templateInclude,
  });

  return mapTemplate(template);
}

export async function createTemplate(input: {
  name: string;
  code?: string;
  tagNames?: string[];
  createdById?: string | null;
}) {
  const code = input.code?.trim() || buildTemplateCode(input.name);
  const normalizedTags = Array.from(new Set((input.tagNames ?? []).map((tag) => tag.trim()).filter(Boolean)));

  const template = await prisma.template.create({
    data: {
      name: input.name,
      code,
      status: 'DRAFT',
      createdById: input.createdById ?? null,
      tags: {
        create: normalizedTags.map((name) => ({
          tag: {
            connectOrCreate: {
              where: { name },
              create: { name },
            },
          },
        })),
      },
      versions: {
        create: {
          versionNumber: 1,
          defaultInput: DEFAULT_INPUT,
          inputExample: DEFAULT_INPUT,
          isCurrent: true,
          createdById: input.createdById ?? null,
          pages: {
            create: {
              pageNumber: 1,
              designerJson: DEFAULT_DESIGNER_JSON,
              pageFormat: 'A4',
              pageOrientation: 'PORTRAIT',
              pageWidthMm: 210,
              pageHeightMm: 297,
              paddingVerticalMm: 12,
              paddingHorizontalMm: 12,
              sourceMode: 'BLANK',
            },
          },
        },
      },
    },
    include: templateInclude,
  });

  return mapTemplate(template);
}

export async function duplicateTemplate(id: string, input: { createdById?: string | null }) {
  const source = await prisma.template.findFirstOrThrow({
    where: { id, status: { not: 'ARCHIVED' } },
    include: {
      tags: { include: { tag: true } },
      versions: {
        where: { isCurrent: true },
        take: 1,
        include: { pages: { orderBy: { pageNumber: 'asc' } } },
      },
    },
  });

  const currentVersion = source.versions[0];
  const pages = currentVersion?.pages.length ? currentVersion.pages : [];
  const name = `Copia de ${source.name}`;
  const createdById = input.createdById === 'bootstrap-admin' ? null : input.createdById ?? null;

  const template = await prisma.template.create({
    data: {
      name,
      code: buildTemplateCode(name),
      thumbnailUrl: source.thumbnailUrl,
      status: 'DRAFT',
      createdById,
      tags: {
        create: source.tags.map((entry) => ({
          tag: { connect: { id: entry.tag.id } },
        })),
      },
      versions: {
        create: {
          versionNumber: 1,
          notes: currentVersion?.notes ?? null,
          defaultInput: currentVersion?.defaultInput ?? DEFAULT_INPUT,
          inputExample: currentVersion?.inputExample ?? DEFAULT_INPUT,
          isCurrent: true,
          isPublished: false,
          createdById,
          pages: {
            create: pages.length > 0
              ? pages.map((page) => ({
                pageNumber: page.pageNumber,
                designerJson: page.designerJson ?? DEFAULT_DESIGNER_JSON,
                pageFormat: page.pageFormat,
                pageOrientation: page.pageOrientation,
                pageWidthMm: page.pageWidthMm,
                pageHeightMm: page.pageHeightMm,
                paddingVerticalMm: page.paddingVerticalMm,
                paddingHorizontalMm: page.paddingHorizontalMm,
                sourceMode: page.sourceMode,
                baseFileName: page.baseFileName,
                baseFileUrl: page.baseFileUrl,
                previewImageUrl: page.previewImageUrl,
              }))
              : {
                pageNumber: 1,
                designerJson: DEFAULT_DESIGNER_JSON,
                pageFormat: 'A4',
                pageOrientation: 'PORTRAIT',
                pageWidthMm: 210,
                pageHeightMm: 297,
                paddingVerticalMm: 12,
                paddingHorizontalMm: 12,
                sourceMode: 'BLANK',
              },
          },
        },
      },
    },
    include: templateInclude,
  });

  return mapTemplate(template);
}

export async function updateTemplateDetails(id: string, input: {
  name?: string;
  code?: string;
  tagNames?: string[];
}) {
  const normalizedTags = input.tagNames
    ? Array.from(new Set(input.tagNames.map((tag) => tag.trim()).filter(Boolean)))
    : undefined;

  const template = await prisma.template.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      code: input.code?.trim(),
      tags: normalizedTags
        ? {
          deleteMany: {},
          create: normalizedTags.map((name) => ({
            tag: {
              connectOrCreate: {
                where: { name },
                create: { name },
              },
            },
          })),
        }
        : undefined,
    },
    include: templateInclude,
  });

  return mapTemplate(template);
}

export async function updateTemplatePageSettings(id: string, input: {
  pageFormat: 'A4' | 'LETTER' | 'LEGAL' | 'CUSTOM';
  pageOrientation: 'PORTRAIT' | 'LANDSCAPE';
  pageWidthMm: number;
  pageHeightMm: number;
  designerJson?: Prisma.InputJsonValue;
}) {
  const currentVersion = await prisma.templateVersion.findFirstOrThrow({
    where: { templateId: id, isCurrent: true },
    include: { pages: { orderBy: { pageNumber: 'asc' } } },
  });
  const schemaPages = input.designerJson ? getSchemaPages(input.designerJson) : currentVersion.pages.map((page) => getSchemaPages(page.designerJson)[0] ?? []);
  const safeSchemaPages = schemaPages.length > 0 ? schemaPages : [[]];

  await prisma.$transaction([
    ...safeSchemaPages.map((pageSchemas, index) => prisma.templatePage.upsert({
      where: {
        templateVersionId_pageNumber: {
          templateVersionId: currentVersion.id,
          pageNumber: index + 1,
        },
      },
      update: {
        pageFormat: input.pageFormat,
        pageOrientation: input.pageOrientation,
        pageWidthMm: input.pageWidthMm,
        pageHeightMm: input.pageHeightMm,
        designerJson: input.designerJson ? buildPageDesignerJson(input.designerJson, pageSchemas) : undefined,
      },
      create: {
        templateVersionId: currentVersion.id,
        pageNumber: index + 1,
        designerJson: input.designerJson ? buildPageDesignerJson(input.designerJson, pageSchemas) : DEFAULT_DESIGNER_JSON,
        pageFormat: input.pageFormat,
        pageOrientation: input.pageOrientation,
        pageWidthMm: input.pageWidthMm,
        pageHeightMm: input.pageHeightMm,
        paddingVerticalMm: 12,
        paddingHorizontalMm: 12,
        sourceMode: 'BLANK',
      },
    })),
    prisma.templatePage.deleteMany({
      where: {
        templateVersionId: currentVersion.id,
        pageNumber: { gt: safeSchemaPages.length },
      },
    }),
  ]);

  const template = await prisma.template.findUniqueOrThrow({ where: { id }, include: templateInclude });
  return mapTemplate(template);
}

export async function updateTemplateSchemaLocks(id: string, input: { lockedSchemaNames: string[] }) {
  const currentVersion = await prisma.templateVersion.findFirstOrThrow({
    where: { templateId: id, isCurrent: true },
    include: { pages: { orderBy: { pageNumber: 'asc' } } },
  });
  const lockedSchemaNames = new Set(input.lockedSchemaNames.map((name) => name.trim()).filter(Boolean));

  await prisma.$transaction(currentVersion.pages.map((page, pageIndex) => {
    const pageSchemas = getSchemaPages(page.designerJson)[0] ?? [];
    return prisma.templatePage.update({
      where: { id: page.id },
      data: {
        designerJson: buildPageDesignerJson(
          page.designerJson,
          applySchemaLocksToPageSchemas(pageSchemas, pageIndex, lockedSchemaNames),
        ),
      },
    });
  }));

  const template = await prisma.template.findUniqueOrThrow({ where: { id }, include: templateInclude });
  return mapTemplate(template);
}

export async function setCurrentTemplateVersion(id: string, versionId: string) {
  await prisma.templateVersion.findFirstOrThrow({
    where: { id: versionId, templateId: id },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.templateVersion.updateMany({ where: { templateId: id }, data: { isCurrent: false } }),
    prisma.templateVersion.update({ where: { id: versionId }, data: { isCurrent: true } }),
  ]);

  const template = await prisma.template.findUniqueOrThrow({ where: { id }, include: templateInclude });
  return mapTemplate(template);
}

export async function createTemplateVersion(id: string, createdById?: string | null) {
  const currentVersion = await prisma.templateVersion.findFirstOrThrow({
    where: { templateId: id, isCurrent: true },
    include: { pages: { orderBy: { pageNumber: 'asc' } } },
  });
  const lastVersion = await prisma.templateVersion.findFirst({
    where: { templateId: id },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  });

  await prisma.$transaction([
    prisma.templateVersion.updateMany({ where: { templateId: id }, data: { isCurrent: false } }),
    prisma.templateVersion.create({
      data: {
        templateId: id,
        versionNumber: (lastVersion?.versionNumber ?? 0) + 1,
        notes: currentVersion.notes,
        defaultInput: currentVersion.defaultInput ?? DEFAULT_INPUT,
        inputExample: currentVersion.inputExample ?? DEFAULT_INPUT,
        isCurrent: true,
        createdById: createdById === 'bootstrap-admin' ? null : createdById ?? null,
        pages: {
          create: currentVersion.pages.map((page) => ({
            pageNumber: page.pageNumber,
            designerJson: page.designerJson ?? DEFAULT_DESIGNER_JSON,
            pageFormat: page.pageFormat,
            pageOrientation: page.pageOrientation,
            pageWidthMm: page.pageWidthMm,
            pageHeightMm: page.pageHeightMm,
            paddingVerticalMm: page.paddingVerticalMm,
            paddingHorizontalMm: page.paddingHorizontalMm,
            sourceMode: page.sourceMode,
            baseFileName: page.baseFileName,
            baseFileUrl: page.baseFileUrl,
            previewImageUrl: page.previewImageUrl,
          })),
        },
      },
    }),
  ]);

  const template = await prisma.template.findUniqueOrThrow({ where: { id }, include: templateInclude });
  return mapTemplate(template);
}

export class CannotDeleteTemplateVersionError extends Error {
  constructor(message = 'No se puede eliminar la version solicitada.') {
    super(message);
    this.name = 'CannotDeleteTemplateVersionError';
  }
}

export async function deleteTemplateVersion(id: string, versionId: string) {
  const versions = await prisma.templateVersion.findMany({
    where: { templateId: id },
    orderBy: { versionNumber: 'asc' },
    select: { id: true, isCurrent: true, versionNumber: true },
  });
  const targetVersion = versions.find((version) => version.id === versionId);

  if (!targetVersion) throw new CannotDeleteTemplateVersionError('No se encontro la version solicitada.');
  if (versions.length <= 1) throw new CannotDeleteTemplateVersionError('No se puede eliminar la unica version de la plantilla.');

  const remainingVersions = versions.filter((version) => version.id !== versionId);
  const currentVersionId = targetVersion.isCurrent
    ? remainingVersions[remainingVersions.length - 1]?.id
    : versions.find((version) => version.isCurrent)?.id;

  await prisma.$transaction([
    prisma.templateVersion.delete({ where: { id: versionId } }),
    ...remainingVersions.map((version, index) => prisma.templateVersion.update({
      where: { id: version.id },
      data: { isCurrent: false, versionNumber: -(index + 1) },
    })),
    ...remainingVersions.map((version, index) => prisma.templateVersion.update({
      where: { id: version.id },
      data: { isCurrent: version.id === currentVersionId, versionNumber: index + 1 },
    })),
  ]);

  const template = await prisma.template.findUniqueOrThrow({ where: { id }, include: templateInclude });
  return mapTemplate(template);
}

export async function deleteTemplate(id: string) {
  await prisma.template.delete({ where: { id } });
}
