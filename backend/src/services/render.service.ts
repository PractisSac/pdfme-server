import { BLANK_PDF } from '@pdfme/common';
import { generate } from '@pdfme/generator';
import {
  barcodes,
  checkbox,
  date,
  dateTime,
  ellipse,
  image,
  line,
  multiVariableText,
  radioGroup,
  rectangle,
  select,
  signature,
  table,
  text,
  time,
} from '@pdfme/schemas';
import type { Prisma } from '@prisma/client';

import { prisma } from '../prisma.js';
import { loadPdfmeFonts } from './pdfme-fonts.service.js';

type JsonRecord = Record<string, unknown>;

const plugins = {
  text,
  multiVariableText,
  image,
  signature,
  table,
  qrcode: barcodes.qrcode,
  code128: barcodes.code128,
  line,
  rectangle,
  ellipse,
  date,
  dateTime,
  time,
  select,
  radioGroup,
  checkbox,
};

const DYNAMIC_OBJECT_SCHEMA_TYPES = new Set(['image', 'qrcode', 'code128', 'date', 'dateTime', 'time']);

type RenderPage = Prisma.TemplatePageGetPayload<Record<string, never>>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getSchemaPages(designerJson: unknown) {
  if (!isRecord(designerJson) || !Array.isArray(designerJson.schemas)) return [[]];
  return designerJson.schemas.length > 0 ? designerJson.schemas : [[]];
}

function composeDesignerJson(pages: Prisma.TemplatePageGetPayload<Record<string, never>>[]) {
  const firstPageJson = pages[0]?.designerJson;
  const base = isRecord(firstPageJson) ? firstPageJson : {};

  return {
    ...base,
    schemas: pages.map((page) => getSchemaPages(page.designerJson)[0] ?? []),
  };
}

function normalizeSchemaPages(schemas: unknown[]): JsonRecord[][] {
  return schemas.map((pageSchemas) => {
    if (Array.isArray(pageSchemas)) return pageSchemas.filter(isRecord);
    if (!isRecord(pageSchemas)) return [];

    return Object.entries(pageSchemas).filter((entry): entry is [string, JsonRecord] => isRecord(entry[1])).map(([name, schema]) => ({
      ...schema,
      name,
    }));
  });
}

function stringifyInputValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function parseObjectContent(value: unknown) {
  if (isRecord(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function extractPlaceholders(value: unknown) {
  if (typeof value !== 'string') return [];

  const matches = value.matchAll(/\{([a-zA-Z0-9_]+)\}/g);
  return Array.from(matches, (match) => match[1]).filter(Boolean);
}

function getDynamicObjectInputKey(schema: JsonRecord) {
  const schemaName = typeof schema.name === 'string' ? schema.name.trim() : '';
  const schemaType = typeof schema.type === 'string' ? schema.type : '';

  if (!schemaName.startsWith('#') || !DYNAMIC_OBJECT_SCHEMA_TYPES.has(schemaType)) return '';

  const rawKey = schemaName.slice(1).trim();
  if (!rawKey) return '';

  return rawKey
    .replace(/#\d+$/i, '')
    .replace(/__(?:p|page)?\d+$/i, '')
    .replace(/_(?:p|page)\d+$/i, '');
}

function pushUnique<T>(list: T[], value: T) {
  if (!list.includes(value)) list.push(value);
}

export function collectTemplateInputs(schemaPages: JsonRecord[][]) {
  const variableMap = new Map<string, { key: string; schemaNames: string[]; pages: number[] }>();
  const objectMap = new Map<string, { key: string; type: string; schemaNames: string[]; pages: number[] }>();

  schemaPages.forEach((page, pageIndex) => {
    page.forEach((schema) => {
      const schemaName = typeof schema.name === 'string' ? schema.name : '';
      const pageNumber = pageIndex + 1;
      const dynamicObjectKey = getDynamicObjectInputKey(schema);

      if (dynamicObjectKey) {
        const type = typeof schema.type === 'string' ? schema.type : 'unknown';
        const mapKey = `${dynamicObjectKey}::${type}`;
        const entry = objectMap.get(mapKey) ?? { key: dynamicObjectKey, type, schemaNames: [], pages: [] };

        if (schemaName) pushUnique(entry.schemaNames, schemaName);
        pushUnique(entry.pages, pageNumber);
        objectMap.set(mapKey, entry);
      }

      const variables = new Set<string>();
      if (Array.isArray(schema.variables)) {
        for (const variable of schema.variables) {
          if (typeof variable === 'string' && variable) variables.add(variable);
        }
      }
      for (const variable of extractPlaceholders(schema.text)) variables.add(variable);
      for (const variable of extractPlaceholders(schema.content)) variables.add(variable);

      for (const variable of variables) {
        const entry = variableMap.get(variable) ?? { key: variable, schemaNames: [], pages: [] };
        if (schemaName) pushUnique(entry.schemaNames, schemaName);
        pushUnique(entry.pages, pageNumber);
        variableMap.set(variable, entry);
      }
    });
  });

  return {
    variables: Array.from(variableMap.values()).sort((a, b) => a.key.localeCompare(b.key)),
    objects: Array.from(objectMap.values()).sort((a, b) => a.key.localeCompare(b.key) || a.type.localeCompare(b.type)),
  };
}

function resolveRenderPages(pages: RenderPage[], selectedPages: number[] = [], ignoredPages: number[] = []) {
  const selected = new Set<number>();
  const ignored = new Set<number>();
  const invalidPages: number[] = [];
  const invalidIgnoredPages: number[] = [];
  const byNumber = new Map(pages.map((page) => [page.pageNumber, page]));

  for (const pageNumber of selectedPages) {
    const page = byNumber.get(pageNumber);

    if (!page) {
      invalidPages.push(pageNumber);
      continue;
    }

    selected.add(page.pageNumber);
  }

  for (const pageNumber of ignoredPages) {
    const page = byNumber.get(pageNumber);

    if (!page) {
      invalidIgnoredPages.push(pageNumber);
      continue;
    }

    ignored.add(page.pageNumber);
  }

  if (invalidPages.length > 0 || invalidIgnoredPages.length > 0) {
    return { ok: false as const, invalidPages, invalidIgnoredPages };
  }

  const basePages = selectedPages.length > 0 ? pages.filter((page) => selected.has(page.pageNumber)) : pages;
  const renderPages = basePages.filter((page) => !ignored.has(page.pageNumber));

  if (renderPages.length === 0) {
    return {
      ok: false as const,
      invalidPages: selectedPages,
      invalidIgnoredPages: ignoredPages,
    };
  }

  return {
    ok: true as const,
    selectedPages: basePages.map((page) => page.pageNumber),
    ignoredPages: basePages.filter((page) => ignored.has(page.pageNumber)).map((page) => page.pageNumber),
    renderPages,
  };
}

function interpolate(value: unknown, input: JsonRecord) {
  if (typeof value !== 'string') return stringifyInputValue(value);

  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => stringifyInputValue(input[key]));
}
function interpolateMarkdownLinkHrefs(value: string, input: JsonRecord) {
  return value.replace(/\]\(([^)]+)\)/g, (_match, href: string) => {
    const normalizedHref = href.trim();
    const interpolatedHref = normalizedHref.replace(/\{([a-zA-Z0-9_]+)\}/g, (placeholder, key: string) => {
      const rawValue = stringifyInputValue(input[key]);
      return normalizedHref === placeholder ? rawValue : encodeURIComponent(rawValue);
    });

    return `](${interpolatedHref})`;
  });
}

function isSingleMarkdownLink(value: string) {
  return /^\s*\[[\s\S]+\]\([^)]+\)\s*$/.test(value);
}

function prepareSchemaPagesForRender(schemaPages: JsonRecord[][], input: JsonRecord) {
  return schemaPages.map((page) => page.map((schema) => {
    if (schema.textFormat !== 'inline-markdown') return schema;

    const preparedSchema = { ...schema };

    if (typeof preparedSchema.text === 'string') {
      const nextText = interpolateMarkdownLinkHrefs(preparedSchema.text, input);
      if (nextText !== preparedSchema.text) preparedSchema.text = nextText;

      if (isSingleMarkdownLink(nextText) && (!preparedSchema.fontColor || preparedSchema.fontColor === '#000000')) {
        preparedSchema.fontColor = '#1677ff';
      }
    }

    if (typeof preparedSchema.content === 'string') {
      const nextContent = interpolateMarkdownLinkHrefs(preparedSchema.content, input);
      if (nextContent !== preparedSchema.content) preparedSchema.content = nextContent;
    }

    return preparedSchema;
  }));
}

function collectRequiredVariables(schemaPages: JsonRecord[][]) {
  const requiredVariables = new Set<string>();

  for (const page of schemaPages) {
    for (const schema of page) {
      if (Array.isArray(schema.variables)) {
        for (const variable of schema.variables) {
          if (typeof variable === 'string' && variable) requiredVariables.add(variable);
        }
      }

      for (const variable of extractPlaceholders(schema.text)) requiredVariables.add(variable);
      for (const variable of extractPlaceholders(schema.content)) requiredVariables.add(variable);
    }
  }

  return Array.from(requiredVariables);
}

function buildPdfmeInput(schemaPages: JsonRecord[][], input: JsonRecord) {
  const pdfmeInput: Record<string, string> = {};

  for (const page of schemaPages) {
    for (const schema of page) {
      const fieldName = typeof schema.name === 'string' ? schema.name : '';
      if (!fieldName) continue;

      if (Object.prototype.hasOwnProperty.call(input, fieldName)) {
        pdfmeInput[fieldName] = stringifyInputValue(input[fieldName]);
        continue;
      }

      const dynamicObjectKey = getDynamicObjectInputKey(schema);
      if (dynamicObjectKey && Object.prototype.hasOwnProperty.call(input, dynamicObjectKey)) {
        pdfmeInput[fieldName] = stringifyInputValue(input[dynamicObjectKey]);
        continue;
      }

      if (schema.type === 'multiVariableText') {
        const defaults = parseObjectContent(schema.content);
        const values = { ...defaults };

        if (Array.isArray(schema.variables)) {
          for (const variable of schema.variables) {
            if (typeof variable === 'string' && Object.prototype.hasOwnProperty.call(input, variable)) {
              values[variable] = stringifyInputValue(input[variable]);
            }
          }
        }

        pdfmeInput[fieldName] = JSON.stringify(values);
        continue;
      }

      if (typeof schema.content === 'string') {
        pdfmeInput[fieldName] = interpolate(schema.content, input);
        continue;
      }

      pdfmeInput[fieldName] = '';
    }
  }

  return pdfmeInput;
}

export async function inspectTemplateInputs(templateCode: string) {
  const template = await prisma.template.findFirst({
    where: { code: templateCode, status: { not: 'ARCHIVED' } },
    include: {
      versions: {
        where: { isCurrent: true, status: true },
        include: { pages: { orderBy: { pageNumber: 'asc' } } },
        take: 1,
      },
    },
  });

  const currentVersion = template?.versions[0];

  if (!template || !currentVersion) {
    return { ok: false as const, status: 404, message: 'No se encontro la plantilla solicitada.' };
  }

  const designerJson = composeDesignerJson(currentVersion.pages);
  const schemaPages = normalizeSchemaPages(getSchemaPages(designerJson));

  return {
    ok: true as const,
    template: {
      code: template.code,
      name: template.name,
      versionNumber: currentVersion.versionNumber,
      pageCount: currentVersion.pages.length,
    },
    inputs: collectTemplateInputs(schemaPages),
    conventions: {
      dynamicObjectPrefix: '#',
      reusableSuffixes: ['#1', '#2', '__p2', '__p3', '__page2', '_p2', '_page2'],
      supportedDynamicObjectTypes: Array.from(DYNAMIC_OBJECT_SCHEMA_TYPES),
    },
  };
}

export async function renderTemplatePdf(input: {
  templateCode: string;
  values: JsonRecord;
  pages?: number[];
  ignoredPages?: number[];
}) {
  const template = await prisma.template.findFirst({
    where: { code: input.templateCode, status: { not: 'ARCHIVED' } },
    include: {
      versions: {
        where: { isCurrent: true, status: true },
        include: { pages: { orderBy: { pageNumber: 'asc' } } },
        take: 1,
      },
    },
  });

  const currentVersion = template?.versions[0];

  if (!template || !currentVersion) {
    return { ok: false as const, status: 404, message: 'No se encontro la plantilla solicitada.' };
  }

  const pageSelection = resolveRenderPages(currentVersion.pages, input.pages, input.ignoredPages);

  if (!pageSelection.ok) {
    return {
      ok: false as const,
      status: 400,
      message: 'Hojas solicitadas invalidas para la plantilla solicitada.',
      invalidPages: pageSelection.invalidPages,
      invalidIgnoredPages: pageSelection.invalidIgnoredPages,
    };
  }

  const designerJson = composeDesignerJson(pageSelection.renderPages);
  const schemaPages = normalizeSchemaPages(getSchemaPages(designerJson));
  const requiredVariables = collectRequiredVariables(schemaPages);
  const missingVariables = requiredVariables.filter((variable) => {
    const value = input.values[variable];
    return value === undefined || value === null || value === '';
  });

  if (missingVariables.length > 0) {
    return {
      ok: false as const,
      status: 400,
      message: 'Faltan variables requeridas para renderizar la plantilla.',
      missingVariables,
    };
  }

  const preparedSchemaPages = prepareSchemaPagesForRender(schemaPages, input.values);
  const pdfmeInput = buildPdfmeInput(preparedSchemaPages, input.values);
  const basePdf = isRecord(designerJson) && 'basePdf' in designerJson && designerJson.basePdf
    ? designerJson.basePdf
    : BLANK_PDF;
  const font = await loadPdfmeFonts();

  const pdf = await generate({
    template: {
      basePdf: basePdf as never,
      schemas: preparedSchemaPages as never,
    },
    inputs: [pdfmeInput],
    plugins,
    options: {
      font,
      lang: 'es',
    },
  });

  return {
    ok: true as const,
    pdf,
    template: {
      code: template.code,
      name: template.name,
      versionNumber: currentVersion.versionNumber,
      pageCount: currentVersion.pages.length,
      selectedPages: pageSelection.selectedPages,
      renderedPageCount: pageSelection.renderPages.length,
      ignoredPages: pageSelection.ignoredPages,
    },
  };
}
