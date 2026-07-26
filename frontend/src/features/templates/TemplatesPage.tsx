import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { AbstractNode, IconDefinition as AntIconDefinition } from '@ant-design/icons-svg/es/types';
import ArrowDownIcon from '@ant-design/icons-svg/es/asn/ArrowDownOutlined';
import ArrowUpIcon from '@ant-design/icons-svg/es/asn/ArrowUpOutlined';
import DeleteIcon from '@ant-design/icons-svg/es/asn/DeleteOutlined';
import EllipsisIcon from '@ant-design/icons-svg/es/asn/EllipsisOutlined';
import LockIcon from '@ant-design/icons-svg/es/asn/LockOutlined';
import UnlockIcon from '@ant-design/icons-svg/es/asn/UnlockOutlined';
import VerticalAlignBottomIcon from '@ant-design/icons-svg/es/asn/VerticalAlignBottomOutlined';
import VerticalAlignTopIcon from '@ant-design/icons-svg/es/asn/VerticalAlignTopOutlined';
import {
  ArrowLeftOutlined,
  CodeOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  EyeOutlined,
  PictureOutlined,
  PlusOutlined,
  SaveOutlined,
  SearchOutlined,
  LockOutlined,
  UnlockOutlined,
  UnorderedListOutlined,
  BarcodeOutlined,
  FileTextOutlined,
  ColumnHeightOutlined,
  ColumnWidthOutlined,
} from '@ant-design/icons';
import {
  Autocomplete,
  Backdrop,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Divider,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { DataTable, PaginationBar } from '../../shared/components/DataTable';
import { LoadingState } from '../../shared/components/LoadingState';
import { AppFormDialog, FormFieldStack } from '../../shared/components/AppFormDialog';
import type { Schema, Template as PdfmeTemplate } from '@pdfme/common';
import { alpha, useTheme } from '@mui/material/styles';
import { h } from 'gridjs';
import { Grid } from 'gridjs-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { can } from '../../app/session';
import type { TagItem, TemplateItem } from '../../app/types';
import { useAppContext } from '../../app/AppContext';
import { apiRequest } from '../../shared/api/client';
import { confirmDanger, notifyError, notifySuccess } from '../../shared/notifications';
import type { PdfmeDesignerHandle } from './components/PdfmeDesigner';
import { normalizePdfmeTemplateFonts } from './components/pdfmeTemplateFonts';

const PdfmeDesigner = lazy(() => import('./components/PdfmeDesigner').then((module) => ({ default: module.PdfmeDesigner })));
const PdfmeViewer = lazy(() => import('./components/PdfmeViewer').then((module) => ({ default: module.PdfmeViewer })));

const pageFormats = [
  { value: 'A4', label: 'A4', width: 210, height: 297 },
  { value: 'LETTER', label: 'Carta', width: 216, height: 279 },
  { value: 'LEGAL', label: 'Legal', width: 216, height: 356 },
  { value: 'CUSTOM', label: 'Personalizado', width: 210, height: 297 },
];

function renderIconNode(node: AbstractNode): string {
  const attrs = Object.entries(node.attrs ?? {})
    .map(([key, value]) => `${key}="${String(value).replace(/"/g, '&quot;')}"`)
    .join(' ');
  const children = (node.children ?? []).map(renderIconNode).join('');
  return `<${node.tag}${attrs ? ` ${attrs}` : ''}>${children}</${node.tag}>`;
}

function renderLibraryIcon(icon: AntIconDefinition, size: number): string {
  const iconNode = typeof icon.icon === 'function' ? icon.icon('currentColor', 'currentColor') : icon.icon;
  return renderIconNode({
    ...iconNode,
    attrs: {
      ...iconNode.attrs,
      'aria-hidden': 'true',
      fill: 'currentColor',
      height: String(size),
      width: String(size),
    },
  });
}

type BlankBasePdf = {
  width: number;
  height: number;
  padding: [number, number, number, number];
};

type TemplateInputItem = {
  key: string;
  pages: number[];
  schemaNames: string[];
  type?: string;
};

type TemplateInputsSnapshot = {
  objects: TemplateInputItem[];
  variables: TemplateInputItem[];
};

const dynamicObjectSchemaTypes = new Set(['image', 'qrcode', 'code128', 'date', 'dateTime', 'time']);

type EditorHeaderControlsProps = {
  editingTemplate: TemplateItem;
  hasMultipleVersions: boolean;
  isPreviewRoute: boolean;
  pageFormat: string;
  pageHeightMm: number;
  pageOrientation: 'PORTRAIT' | 'LANDSCAPE';
  pageWidthMm: number;
  saving: boolean;
  savingDetails: boolean;
  savingVersion: boolean;
  switchingVersion: boolean;
  onBack: () => void;
  onEditPreview: () => void;
  onFormatChange: (format: string) => void;
  onHeightChange: (height: number) => void;
  onOpenDetails: () => void;
  onOpenInputs: () => void;
  onOpenVersions: () => void;
  onSave: () => void;
  onSaveVersion: () => void;
  onToggleOrientation: () => void;
  onWidthChange: (width: number) => void;
};

function EditorHeaderControls({
  editingTemplate,
  hasMultipleVersions,
  isPreviewRoute,
  pageFormat,
  pageHeightMm,
  pageOrientation,
  pageWidthMm,
  saving,
  savingDetails,
  savingVersion,
  switchingVersion,
  onBack,
  onEditPreview,
  onFormatChange,
  onHeightChange,
  onOpenDetails,
  onOpenInputs,
  onOpenVersions,
  onSave,
  onSaveVersion,
  onToggleOrientation,
  onWidthChange,
}: EditorHeaderControlsProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const closeMenu = () => setMenuAnchor(null);

  return (
    <Box
      sx={{
        alignItems: 'center',
        columnGap: 1.5,
        display: 'grid',
        flex: 1,
        gridTemplateColumns: {
          xs: 'minmax(0, 1fr) auto',
          md: 'auto auto minmax(120px, 1fr) auto',
        },
        minWidth: 0,
        width: '100%',
      }}
    >
      <Button onClick={onBack} startIcon={<ArrowLeftOutlined />} sx={{ flexShrink: 0 }}>Volver</Button>
      <Divider flexItem orientation="vertical" sx={{ display: { xs: 'none', md: 'block' } }} />
      <Box sx={{ alignItems: 'center', display: { xs: 'none', sm: 'flex' }, gap: 1.25, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, maxWidth: { xs: 110, sm: 180, md: 240 } }} variant="subtitle2" noWrap>{editingTemplate.name}</Typography>
        <Chip color="primary" label={`v${editingTemplate.versionNumber}`} size="small" sx={{ flexShrink: 0 }} variant="outlined" />
      </Box>
      {isPreviewRoute ? (
        <Button onClick={onEditPreview} size="small" startIcon={<EditOutlined />} sx={{ ml: 'auto' }} variant="outlined">Editar</Button>
      ) : (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'flex-end', justifySelf: 'end', minWidth: 0 }}>
          <Box
            sx={{
              alignItems: 'center',
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1.5,
              display: 'flex',
              gap: 0.75,
              maxWidth: '100%',
              px: 0.75,
              py: 0.5,
            }}
          >
            <TextField label="Formato" onChange={(event) => onFormatChange(event.target.value)} select size="small" sx={{ width: 100 }} value={pageFormat}>
              {pageFormats.map((format) => <MenuItem key={format.value} value={format.value}>{format.label}</MenuItem>)}
            </TextField>
            <TextField label="Ancho" onChange={(event) => onWidthChange(Number(event.target.value))} size="small" sx={{ width: 86 }} type="number" value={pageWidthMm} />
            <TextField label="Alto" onChange={(event) => onHeightChange(Number(event.target.value))} size="small" sx={{ width: 86 }} type="number" value={pageHeightMm} />
            <Tooltip title={pageOrientation === 'LANDSCAPE' ? 'Cambiar a Vertical' : 'Cambiar a Horizontal'}>
              <IconButton onClick={onToggleOrientation} color="primary" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 0, width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {pageOrientation === 'LANDSCAPE' ? <ColumnHeightOutlined /> : <ColumnWidthOutlined />}
              </IconButton>
            </Tooltip>
          </Box>
          <Button disabled={saving || switchingVersion} onClick={onSave} size="small" startIcon={<SaveOutlined />} variant="contained">
            Guardar
          </Button>
          <IconButton disabled={saving || savingVersion || switchingVersion || savingDetails} onClick={(event) => setMenuAnchor(event.currentTarget)} size="small">
            <EllipsisOutlined />
          </IconButton>
          <Menu anchorEl={menuAnchor} onClose={closeMenu} open={Boolean(menuAnchor)} transitionDuration={120}>
            <MenuItem disabled={savingVersion} onClick={() => { closeMenu(); onSaveVersion(); }}>
              Guardar version
            </MenuItem>
            <MenuItem disabled={!hasMultipleVersions} onClick={() => { closeMenu(); onOpenVersions(); }}>
              Cambiar version
            </MenuItem>
            <MenuItem onClick={() => { closeMenu(); onOpenInputs(); }}>Variables y objetos</MenuItem>
            <MenuItem onClick={() => { closeMenu(); onOpenDetails(); }}>Propiedades</MenuItem>
          </Menu>
        </Stack>
      )}
    </Box>
  );
}

function randomSuffix() {
  const values = new Uint8Array(4);
  crypto.getRandomValues(values);
  return Array.from(values).map((value) => value.toString(16).padStart(2, '0')).join('');
}

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

function buildCode(name: string, suffix: string) {
  return `${slugifyCode(name)}_${suffix}`;
}

function buildPdfmeTemplate(template: TemplateItem, options?: { pageWidthMm?: number; pageHeightMm?: number }) {
  const storedTemplate = template.designerJson ?? {};
  const storedBasePdf = typeof storedTemplate.basePdf === 'object' && storedTemplate.basePdf && !Array.isArray(storedTemplate.basePdf)
    ? storedTemplate.basePdf as Record<string, unknown>
    : {} as Record<string, unknown>;
  const width = options?.pageWidthMm ?? template.pageWidthMm;
  const height = options?.pageHeightMm ?? template.pageHeightMm;

  return normalizePdfmeTemplateFonts({
    ...storedTemplate,
    schemas: Array.isArray(storedTemplate.schemas) ? storedTemplate.schemas : [[]],
    basePdf: {
      ...storedBasePdf,
      width,
      height,
      padding: [0, 0, 0, 0],
    },
  } as PdfmeTemplate);
}

function updatePdfmeBasePdf(current: PdfmeTemplate | null, patch: { width?: number; height?: number }) {
  if (!current) return current;
  const basePdf = typeof current.basePdf === 'object' && current.basePdf && 'width' in current.basePdf && 'height' in current.basePdf
    ? current.basePdf as BlankBasePdf
    : { width: 210, height: 297, padding: [0, 0, 0, 0] as [number, number, number, number] };
  const nextWidth = patch.width ?? basePdf.width;
  const nextHeight = patch.height ?? basePdf.height;

  return {
    ...current,
    basePdf: {
      ...basePdf,
      ...patch,
      width: nextWidth,
      height: nextHeight,
      padding: basePdf.padding ?? [0, 0, 0, 0],
    },
  } as PdfmeTemplate;
}

function extractPlaceholders(value: unknown) {
  if (typeof value !== 'string') return [];

  return Array.from(value.matchAll(/\{([a-zA-Z0-9_]+)\}/g), (match) => match[1]).filter(Boolean);
}

function getDynamicObjectInputKey(schema: Schema) {
  const schemaName = typeof schema.name === 'string' ? schema.name.trim() : '';
  const schemaType = typeof schema.type === 'string' ? schema.type : '';

  if (!schemaName.startsWith('#') || !dynamicObjectSchemaTypes.has(schemaType)) return '';

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

function collectTemplateInputsFromTemplate(template: PdfmeTemplate | null): TemplateInputsSnapshot {
  const variableMap = new Map<string, TemplateInputItem>();
  const objectMap = new Map<string, TemplateInputItem>();

  template?.schemas?.forEach((pageSchemas, pageIndex) => {
    if (!Array.isArray(pageSchemas)) return;

    pageSchemas.forEach((schema) => {
      const schemaName = typeof schema.name === 'string' ? schema.name : '';
      const schemaType = typeof schema.type === 'string' ? schema.type : '';
      const pageNumber = pageIndex + 1;
      const objectKey = getDynamicObjectInputKey(schema);

      if (objectKey) {
        const mapKey = `${objectKey}::${schemaType}`;
        const entry = objectMap.get(mapKey) ?? { key: objectKey, type: schemaType, schemaNames: [], pages: [] };
        if (schemaName) pushUnique(entry.schemaNames, schemaName);
        pushUnique(entry.pages, pageNumber);
        objectMap.set(mapKey, entry);
      }

      const variables = new Set<string>();
      const schemaVariables = 'variables' in schema && Array.isArray(schema.variables) ? schema.variables : [];
      for (const variable of schemaVariables) {
        if (typeof variable === 'string' && variable) variables.add(variable);
      }
      if ('text' in schema) for (const variable of extractPlaceholders(schema.text)) variables.add(variable);
      if ('content' in schema) for (const variable of extractPlaceholders(schema.content)) variables.add(variable);

      for (const variable of variables) {
        const entry = variableMap.get(variable) ?? { key: variable, schemaNames: [], pages: [] };
        if (schemaName) pushUnique(entry.schemaNames, schemaName);
        pushUnique(entry.pages, pageNumber);
        variableMap.set(variable, entry);
      }
    });
  });

  return {
    objects: Array.from(objectMap.values()).sort((a, b) => a.key.localeCompare(b.key) || String(a.type).localeCompare(String(b.type))),
    variables: Array.from(variableMap.values()).sort((a, b) => a.key.localeCompare(b.key)),
  };
}

function buildInputsJson(snapshot: TemplateInputsSnapshot) {
  const values: Record<string, string> = {};

  for (const item of snapshot.variables) values[item.key] = '';
  for (const item of snapshot.objects) values[item.key] = '';

  return JSON.stringify({ values }, null, 2);
}

function getInputsRows(snapshot: TemplateInputsSnapshot) {
  return [
    ...snapshot.variables.map((item) => ({ ...item, sourceType: 'Variable' })),
    ...snapshot.objects.map((item) => ({ ...item, sourceType: `Objeto ${item.type ?? ''}`.trim() })),
  ].sort((a, b) => a.key.localeCompare(b.key) || a.sourceType.localeCompare(b.sourceType));
}

export function TemplatesPage() {
  const { user, mode, setHeaderAction, closeHeaderAction, openHeaderAction, setHeaderControls, setOperationLabel, clearOperationLabel } = useAppContext();
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { code: routeCode } = useParams();
  const isPreviewRoute = location.pathname.includes('/templates/preview/');
  const isEditRoute = location.pathname.includes('/templates/edit/');
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [availableTags, setAvailableTags] = useState<TagItem[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<TemplateItem | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState(() => buildCode('', randomSuffix()));
  const [codeTouched, setCodeTouched] = useState(false);
  const [codeSuffix, setCodeSuffix] = useState(() => randomSuffix());
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [switchingVersion, setSwitchingVersion] = useState(false);
  const [deletingVersionId, setDeletingVersionId] = useState('');
  const [duplicatingId, setDuplicatingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [page, setPage] = useState(0);
  const [pageFormat, setPageFormat] = useState('A4');
  const [pageOrientation, setPageOrientation] = useState<'PORTRAIT' | 'LANDSCAPE'>('PORTRAIT');
  const [pageWidthMm, setPageWidthMm] = useState(210);
  const [pageHeightMm, setPageHeightMm] = useState(297);
  const [designerTemplate, setDesignerTemplate] = useState<PdfmeTemplate | null>(null);
  const [lockedSchemaNames, setLockedSchemaNames] = useState<string[]>([]);
  const [versionsDialogOpen, setVersionsDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [inputsDialogOpen, setInputsDialogOpen] = useState(false);
  const [inputsSnapshot, setInputsSnapshot] = useState<TemplateInputsSnapshot>({ objects: [], variables: [] });
  const [detailsTemplate, setDetailsTemplate] = useState<TemplateItem | null>(null);
  const [detailsMode, setDetailsMode] = useState<'details' | 'tags'>('details');
  const [detailsName, setDetailsName] = useState('');
  const [detailsCode, setDetailsCode] = useState('');
  const [detailsTags, setDetailsTags] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const designerRef = useRef<PdfmeDesignerHandle | null>(null);
  const getSchemaLockKey = (pageIndex: number, schemaName: string) => `${pageIndex}::${schemaName.trim()}`;
  const getSchemaPositionKey = (pageIndex: number, schemaIndex: number) => `${pageIndex}::${schemaIndex}`;
  const previousSchemaLockKeyByPositionRef = useRef<Record<string, string>>({});
  const lockedSchemaNamesRef = useRef<string[]>([]);
  const isSchemaLockedByKeys = (lockKeys: string[], pageIndex: number, schemaName: string, schemaIndex?: number) => {
    const lockKey = getSchemaLockKey(pageIndex, schemaName);
    if (lockKeys.includes(lockKey)) return true;
    if (typeof schemaIndex !== 'number') return false;
    const previousLockKey = previousSchemaLockKeyByPositionRef.current[getSchemaPositionKey(pageIndex, schemaIndex)];
    return previousLockKey ? lockKeys.includes(previousLockKey) : false;
  };
  const isSchemaLocked = (pageIndex: number, schemaName: string, schemaIndex?: number) => {
    return isSchemaLockedByKeys(lockedSchemaNames, pageIndex, schemaName, schemaIndex);
  };
  const editorBusy = saving || savingVersion || savingDetails || switchingVersion;
  const editorBusyLabel = switchingVersion
    ? 'Cambiando version...'
    : savingVersion
      ? 'Creando version...'
      : savingDetails
        ? 'Guardando datos...'
        : 'Guardando plantilla...';

  async function load() {
    if (templates.length === 0) setLoading(true);
    try {
      const params = new URLSearchParams();
      const searchQuery = search.trim();
      if (searchQuery) params.set('search', searchQuery);
      if (tagFilter) params.set('tag', tagFilter);
      const queryString = params.toString();
      const templatePath = `/api/templates${queryString ? `?${queryString}` : ''}`;
      const [payload, tagsPayload] = await Promise.all([
        apiRequest<{ data: TemplateItem[] }>(templatePath),
        apiRequest<{ data: TagItem[] }>('/api/tags').catch(() => ({ data: [] })),
      ]);
      setTemplates(payload.data);
      setAvailableTags(tagsPayload.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (routeCode) return;
    const timeoutId = window.setTimeout(() => {
      void load().catch((err) => notifyError(err, 'No se pudo cargar.'));
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [routeCode, search, tagFilter]);

  useEffect(() => {
    if (!routeCode) {
      setEditingTemplate(null);
      setDesignerTemplate(null);
      setLoadingTemplate(false);
      return;
    }

    let active = true;

    setLoadingTemplate(true);
    setError('');
    apiRequest<{ template: TemplateItem }>(`/api/templates/by-code/${routeCode}`)
      .then((payload) => {
        if (!active) return;
        openEditor(payload.template);
      })
      .catch((err) => {
        if (!active) return;
        setError('No se encontro la plantilla solicitada.');
        notifyError(err, 'No se encontro la plantilla solicitada.');
        setEditingTemplate(null);
        setDesignerTemplate(null);
      })
      .finally(() => {
        if (active) setLoadingTemplate(false);
      });

    return () => { active = false; };
  }, [routeCode]);

  const filteredTemplates = useMemo(() => {
    return templates;
  }, [templates]);


  const editingTemplateVersions = editingTemplate?.versions ?? [];
  const hasMultipleVersions = editingTemplateVersions.length > 1;
  const designerWorkspaceKey = editingTemplate
    ? [
      editingTemplate.id,
      editingTemplate.versionId,
      isPreviewRoute ? 'preview' : 'edit',
    ].join(':')
    : 'empty';

  useEffect(() => {
    lockedSchemaNamesRef.current = lockedSchemaNames;
  }, [lockedSchemaNames]);


  function resetCreateForm() {
    const suffix = randomSuffix();
    setName('');
    setCodeSuffix(suffix);
    setCode(buildCode('', suffix));
    setCodeTouched(false);
    setSelectedTags([]);
  }

  function openEditor(template: TemplateItem) {
    setEditingTemplate(template);
    setDetailsName(template.name);
    setDetailsCode(template.code);
    setDetailsTags(template.tags);
    setPageFormat(template.pageFormat);
    setPageOrientation(template.pageOrientation === 'LANDSCAPE' ? 'LANDSCAPE' : 'PORTRAIT');
    setPageWidthMm(template.pageWidthMm);
    setPageHeightMm(template.pageHeightMm);
    setDesignerTemplate(buildPdfmeTemplate(template));
    setError('');
  }

  async function create() {
    const nextName = name.trim();
    const nextCode = code.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    if (nextName.length < 2) {
      notifyError('Ingresa un nombre para la plantilla.');
      return;
    }

    if (!nextCode) {
      notifyError('Ingresa el codigo de la plantilla.');
      return;
    }

    setError('');
    setCreating(true);
    setOperationLabel('Creando plantilla...');
    try {
      const payload = await apiRequest<{ template: TemplateItem }>('/api/templates', {
        method: 'POST',
        body: JSON.stringify({ name: nextName, code: nextCode, tagNames: selectedTags }),
      });
      resetCreateForm();
      closeHeaderAction();
      navigate(`/templates/edit/${payload.template.code}`);
    } catch (err) {
      notifyError(err, 'No se pudo crear la plantilla.');
    } finally {
      setCreating(false);
      clearOperationLabel();
    }
  }

  useEffect(() => {
    if (editingTemplate || !can(user, 'templates.create')) {
      setHeaderAction(null);
      return;
    }

    setHeaderAction({
      label: 'Agregar',
      title: 'Nueva plantilla',
      maxWidth: 'sm',
      content: (
        <FormFieldStack
          id="create-template-form"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <TextField
            autoFocus
            fullWidth
            label="Nombre"
            onChange={(event) => {
              const nextName = event.target.value;
              setName(nextName);
              if (!codeTouched) setCode(buildCode(nextName, codeSuffix));
            }}
            value={name}
          />
          <TextField
            fullWidth
            helperText="Identificador usado por apps/API."
            label="Codigo"
            onChange={(event) => { setCode(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')); setCodeTouched(true); }}
            value={code}
          />
          <Autocomplete
            freeSolo
            multiple
            onChange={(_event, value) => setSelectedTags(Array.from(new Set(value.map((tag) => tag.trim()).filter(Boolean))))}
            options={availableTags.map((tag) => tag.name)}
            renderInput={(params) => <TextField {...params} helperText="Selecciona o escribe tags." label="Tags" />}
            value={selectedTags}
          />
        </FormFieldStack>
      ),
      contentActions: (
        <>
          <Button onClick={closeHeaderAction}>Cancelar</Button>
          <Button disabled={creating || name.trim().length < 2 || !code.trim()} form="create-template-form" startIcon={<PlusOutlined />} type="submit" variant="contained">Crear</Button>
        </>
      ),
    });

    return () => setHeaderAction(null);
  }, [availableTags, clearOperationLabel, closeHeaderAction, code, codeSuffix, codeTouched, creating, editingTemplate, name, navigate, selectedTags, setHeaderAction, setOperationLabel, user]);

  function getLiveDesignerTemplate() {
    const designerCurrentTemplate = designerRef.current?.getTemplate();
    const currentDesignerTemplate = designerTemplate && designerCurrentTemplate
      ? { ...designerCurrentTemplate, basePdf: designerTemplate.basePdf }
      : designerCurrentTemplate ?? designerTemplate;
    return currentDesignerTemplate ? normalizePdfmeTemplateFonts(currentDesignerTemplate) : currentDesignerTemplate;
  }

  function applyLocksToTemplate(template: PdfmeTemplate, lockKeys: string[]) {
    return {
      ...template,
      schemas: template.schemas.map((pageSchemas, pageIndex) => {
        if (!Array.isArray(pageSchemas)) return pageSchemas;
        return pageSchemas.map((schema, schemaIndex) => {
          const schemaName = schema.name?.trim() || '';
          const isLocked = schemaName ? isSchemaLockedByKeys(lockKeys, pageIndex, schemaName, schemaIndex) : false;
          return {
            ...schema,
            __isLocked: isLocked,
          };
        });
      }) as any,
    } as PdfmeTemplate;
  }

  function refreshLockStateFromTemplate(template: PdfmeTemplate) {
    const nextLockedSchemaNames: string[] = [];
    const nextSchemaLockKeyByPosition: Record<string, string> = {};
    template.schemas.forEach((pageSchemas, pageIndex) => {
      if (!Array.isArray(pageSchemas)) return;
      pageSchemas.forEach((schema, schemaIndex) => {
        if (!schema?.name) return;
        const lockKey = getSchemaLockKey(pageIndex, schema.name);
        nextSchemaLockKeyByPosition[getSchemaPositionKey(pageIndex, schemaIndex)] = lockKey;
        if (schema.__isLocked) nextLockedSchemaNames.push(lockKey);
      });
    });
    previousSchemaLockKeyByPositionRef.current = nextSchemaLockKeyByPosition;
    lockedSchemaNamesRef.current = nextLockedSchemaNames;
    setLockedSchemaNames(nextLockedSchemaNames);
  }

  async function saveSettings(options?: { designerTemplateOverride?: PdfmeTemplate | null; lockedSchemaNamesOverride?: string[] }) {
    if (!editingTemplate) return null;
    const lockKeys = options?.lockedSchemaNamesOverride ?? lockedSchemaNames;
    let currentDesignerTemplate = options?.designerTemplateOverride ?? getLiveDesignerTemplate();

    if (currentDesignerTemplate && currentDesignerTemplate.schemas) {
      currentDesignerTemplate = applyLocksToTemplate(normalizePdfmeTemplateFonts(currentDesignerTemplate), lockKeys);
    }

    setError('');
    setSaving(true);
    try {
      const payload = await apiRequest<{ template: TemplateItem }>('/api/templates/' + editingTemplate.id + '/page-settings', {
        method: 'PATCH',
        body: JSON.stringify({ pageFormat, pageOrientation, pageWidthMm, pageHeightMm, designerJson: currentDesignerTemplate }),
      });
      if (currentDesignerTemplate) {
        setDesignerTemplate(currentDesignerTemplate);
        refreshLockStateFromTemplate(currentDesignerTemplate);
      }
      setEditingTemplate(payload.template);
      if (!routeCode) await load();
      return payload.template;
    } catch (err) {
      notifyError(err, 'No se pudo guardar la plantilla.');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveVersion() {
    if (!editingTemplate) return;
    setError('');
    setSavingVersion(true);
    try {
      await saveSettings();
      const payload = await apiRequest<{ template: TemplateItem }>('/api/templates/' + editingTemplate.id + '/versions', { method: 'POST' });
      setEditingTemplate(payload.template);
      setDesignerTemplate(buildPdfmeTemplate(payload.template));
      if (!routeCode) await load();
    } catch (err) {
      notifyError(err, 'No se pudo guardar una nueva version.');
    } finally {
      setSavingVersion(false);
    }
  }

  async function switchVersion(versionId: string) {
    if (!editingTemplate || versionId === editingTemplate.versionId) return;
    setError('');
    setSwitchingVersion(true);
    try {
      const savedTemplate = await saveSettings();
      const templateId = savedTemplate?.id ?? editingTemplate.id;
      const payload = await apiRequest<{ template: TemplateItem }>(`/api/templates/${templateId}/versions/${versionId}/current`, { method: 'PATCH' });
      setEditingTemplate(payload.template);
      setPageFormat(payload.template.pageFormat);
      setPageOrientation(payload.template.pageOrientation === 'LANDSCAPE' ? 'LANDSCAPE' : 'PORTRAIT');
      setPageWidthMm(payload.template.pageWidthMm);
      setPageHeightMm(payload.template.pageHeightMm);
      setDesignerTemplate(buildPdfmeTemplate(payload.template));
      setVersionsDialogOpen(false);
      if (!routeCode) await load();
    } catch (err) {
      notifyError(err, 'No se pudo cambiar de version.');
    } finally {
      setSwitchingVersion(false);
    }
  }

  async function confirmDeleteVersion(versionId: string, versionNumber: number) {
    if (!editingTemplate || editingTemplateVersions.length <= 1) return;
    const confirmed = await confirmDanger({ text: `¿Eliminar la version ${versionNumber} de "${editingTemplate.name}"?` });
    if (!confirmed) return;

    setError('');
    setDeletingVersionId(versionId);
    try {
      const payload = await apiRequest<{ template: TemplateItem }>(`/api/templates/${editingTemplate.id}/versions/${versionId}`, { method: 'DELETE' });
      setEditingTemplate(payload.template);
      setPageFormat(payload.template.pageFormat);
      setPageOrientation(payload.template.pageOrientation === 'LANDSCAPE' ? 'LANDSCAPE' : 'PORTRAIT');
      setPageWidthMm(payload.template.pageWidthMm);
      setPageHeightMm(payload.template.pageHeightMm);
      setDesignerTemplate(buildPdfmeTemplate(payload.template));
      if (payload.template.versions.length <= 1) setVersionsDialogOpen(false);
      if (!routeCode) await load();
      await notifySuccess('Version eliminada.');
    } catch (err) {
      notifyError(err, 'No se pudo eliminar la version.');
    } finally {
      setDeletingVersionId('');
    }
  }

  function openDetailsDialog(template = editingTemplate, mode: 'details' | 'tags' = 'details') {
    if (!template) return;
    setDetailsTemplate(template);
    setDetailsMode(mode);
    setDetailsName(template.name);
    setDetailsCode(template.code);
    setDetailsTags(template.tags);
    setDetailsDialogOpen(true);
  }

  async function saveDetails() {
    const targetTemplate = detailsTemplate ?? editingTemplate;
    if (!targetTemplate) return;
    const nextName = detailsName.trim();
    const nextCode = detailsCode.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    if (nextName.length < 2) {
      notifyError('Ingresa un nombre para la plantilla.');
      return;
    }

    if (!nextCode) {
      notifyError('Ingresa el codigo de la plantilla.');
      return;
    }

    setError('');
    setSavingDetails(true);
    try {
      const tagNames = detailsTags.map((tag) => tag.trim()).filter(Boolean);
      const payload = await apiRequest<{ template: TemplateItem }>('/api/templates/' + targetTemplate.id, {
        method: 'PATCH',
        body: JSON.stringify({
          name: nextName,
          code: nextCode,
          tagNames,
        }),
      });
      setTemplates((current) => current.map((template) => template.id === payload.template.id ? payload.template : template));
      if (editingTemplate?.id === payload.template.id) setEditingTemplate(payload.template);
      setAvailableTags((current) => {
        const known = new Set(current.map((tag) => tag.name));
        const created = tagNames.filter((tag) => !known.has(tag));
        if (created.length === 0) return current;
        return [
          ...current,
          ...created.map((tag) => ({ id: tag, name: tag, templateCount: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })),
        ].sort((a, b) => a.name.localeCompare(b.name));
      });
      setDetailsDialogOpen(false);
      setDetailsTemplate(null);
      if (editingTemplate?.id === payload.template.id && payload.template.code !== routeCode) {
        navigate(`/templates/edit/${payload.template.code}`, { replace: true });
      }
      if (!routeCode) await load();
    } catch (err) {
      notifyError(err, 'No se pudo actualizar la plantilla.');
    } finally {
      setSavingDetails(false);
    }
  }

  function openInputsDialog() {
    const liveTemplate = designerRef.current?.getTemplate() ?? designerTemplate;
    setInputsSnapshot(collectTemplateInputsFromTemplate(liveTemplate));
    setInputsDialogOpen(true);
  }

  async function copyTextToClipboard(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      await notifySuccess(successMessage);
    } catch (error) {
      notifyError(error, 'No se pudo copiar al portapapeles.');
    }
  }

  async function remove(id: string) {
    setError('');
    setDeletingId(id);
    setOperationLabel('Eliminando plantilla...');
    try {
      await apiRequest(`/api/templates/${id}`, { method: 'DELETE' });
      setTemplates((current) => current.filter((template) => template.id !== id));
    } catch (err) {
      notifyError(err, 'No se pudo eliminar la plantilla.');
    } finally {
      setDeletingId('');
      clearOperationLabel();
    }
  }

  async function confirmRemove(template: TemplateItem) {
    const confirmed = await confirmDanger({ text: `¿Estás seguro que quieres eliminar la plantilla "${template.name}"?` });
    if (confirmed) await remove(template.id);
  }

  async function duplicate(template: TemplateItem) {
    setError('');
    setDuplicatingId(template.id);
    setOperationLabel('Duplicando plantilla...');
    try {
      const payload = await apiRequest<{ template: TemplateItem }>(`/api/templates/${template.id}/duplicate`, { method: 'POST' });
      setTemplates((current) => [payload.template, ...current]);
      setEditingTemplate(payload.template);
      setPageFormat(payload.template.pageFormat);
      setPageOrientation(payload.template.pageOrientation === 'LANDSCAPE' ? 'LANDSCAPE' : 'PORTRAIT');
      setPageWidthMm(payload.template.pageWidthMm);
      setPageHeightMm(payload.template.pageHeightMm);
      setDesignerTemplate(buildPdfmeTemplate(payload.template));
      navigate(`/templates/edit/${payload.template.code}`);
    } catch (err) {
      notifyError(err, 'No se pudo duplicar la plantilla.');
    } finally {
      setDuplicatingId('');
      clearOperationLabel();
    }
  }

  function setFormat(format: string) {
    setPageFormat(format);
    if (format === 'CUSTOM') return;
    const selectedFormat = pageFormats.find((item) => item.value === format);
    if (!selectedFormat) return;
    if (pageOrientation === 'LANDSCAPE') {
      setPageWidthMm(selectedFormat.height);
      setPageHeightMm(selectedFormat.width);
      setDesignerTemplate((current) => updatePdfmeBasePdf(current, { width: selectedFormat.height, height: selectedFormat.width }));
    } else {
      setPageWidthMm(selectedFormat.width);
      setPageHeightMm(selectedFormat.height);
      setDesignerTemplate((current) => updatePdfmeBasePdf(current, { width: selectedFormat.width, height: selectedFormat.height }));
    }
  }

  function toggleOrientation() {
    setPageOrientation((value) => value === 'PORTRAIT' ? 'LANDSCAPE' : 'PORTRAIT');
    setPageWidthMm(pageHeightMm);
    setPageHeightMm(pageWidthMm);
    setDesignerTemplate((current) => updatePdfmeBasePdf(current, { width: pageHeightMm, height: pageWidthMm }));
  }

  function shiftLockKeys(lockKeys: string[], pageIndex: number, direction: 'insert' | 'delete') {
    return lockKeys.flatMap((lockKey) => {
      const separatorIndex = lockKey.indexOf('::');
      const keyPageIndex = Number(lockKey.slice(0, separatorIndex));
      const schemaName = lockKey.slice(separatorIndex + 2);

      if (!Number.isInteger(keyPageIndex) || separatorIndex === -1) return [lockKey];
      if (direction === 'insert') {
        return [getSchemaLockKey(keyPageIndex >= pageIndex ? keyPageIndex + 1 : keyPageIndex, schemaName)];
      }
      if (keyPageIndex === pageIndex) return [];
      return [getSchemaLockKey(keyPageIndex > pageIndex ? keyPageIndex - 1 : keyPageIndex, schemaName)];
    });
  }

  function reorderLockKeys(lockKeys: string[], nextOrder: number[]) {
    const nextIndexByCurrentIndex = new Map(nextOrder.map((currentIndex, nextIndex) => [currentIndex, nextIndex]));
    return lockKeys.flatMap((lockKey) => {
      const separatorIndex = lockKey.indexOf('::');
      const keyPageIndex = Number(lockKey.slice(0, separatorIndex));
      const schemaName = lockKey.slice(separatorIndex + 2);
      const nextPageIndex = nextIndexByCurrentIndex.get(keyPageIndex);

      if (!Number.isInteger(keyPageIndex) || separatorIndex === -1 || typeof nextPageIndex !== 'number') return [];
      return [getSchemaLockKey(nextPageIndex, schemaName)];
    });
  }

  async function applyPendingTemplateChange(nextTemplate: PdfmeTemplate, nextLocks: string[], successMessage: string) {
    lockedSchemaNamesRef.current = nextLocks;
    setLockedSchemaNames(nextLocks);
    designerRef.current?.updateTemplate(nextTemplate);
    setDesignerTemplate(nextTemplate);
    await notifySuccess(successMessage);
  }

  function getEditableDesignerTemplate() {
    const liveTemplate = getLiveDesignerTemplate();
    if (!liveTemplate?.schemas?.length) return null;
    return liveTemplate;
  }

  async function insertPageBefore(pageIndex: number) {
    const currentTemplate = getEditableDesignerTemplate();
    if (!currentTemplate) return;
    const safePageIndex = Math.max(0, Math.min(pageIndex, currentTemplate.schemas.length));
    const nextLocks = shiftLockKeys(lockedSchemaNamesRef.current, safePageIndex, 'insert');
    const nextTemplate = applyLocksToTemplate({
      ...currentTemplate,
      schemas: [
        ...currentTemplate.schemas.slice(0, safePageIndex),
        [],
        ...currentTemplate.schemas.slice(safePageIndex),
      ],
    } as PdfmeTemplate, nextLocks);

    await applyPendingTemplateChange(nextTemplate, nextLocks, 'Hoja agregada. Presiona Guardar para confirmar el cambio.');
  }

  async function insertPageAfter(pageIndex: number) {
    const currentTemplate = getEditableDesignerTemplate();
    if (!currentTemplate) return;
    const safePageIndex = Math.max(0, Math.min(pageIndex + 1, currentTemplate.schemas.length));
    const nextLocks = shiftLockKeys(lockedSchemaNamesRef.current, safePageIndex, 'insert');
    const nextTemplate = applyLocksToTemplate({
      ...currentTemplate,
      schemas: [
        ...currentTemplate.schemas.slice(0, safePageIndex),
        [],
        ...currentTemplate.schemas.slice(safePageIndex),
      ],
    } as PdfmeTemplate, nextLocks);

    await applyPendingTemplateChange(nextTemplate, nextLocks, 'Hoja agregada. Presiona Guardar para confirmar el cambio.');
  }

  async function deletePage(pageIndex: number) {
    const currentTemplate = getEditableDesignerTemplate();
    if (!currentTemplate) return;
    if (currentTemplate.schemas.length <= 1) {
      notifyError('No se puede eliminar la unica hoja de la plantilla.');
      return;
    }

    const safePageIndex = Math.max(0, Math.min(pageIndex, currentTemplate.schemas.length - 1));
    const nextLocks = shiftLockKeys(lockedSchemaNamesRef.current, safePageIndex, 'delete');
    const nextTemplate = applyLocksToTemplate({
      ...currentTemplate,
      schemas: currentTemplate.schemas.filter((_pageSchemas, index) => index !== safePageIndex),
    } as PdfmeTemplate, nextLocks);

    await applyPendingTemplateChange(nextTemplate, nextLocks, 'Hoja eliminada. Presiona Guardar para confirmar el cambio.');
  }

  async function moveActivePage(direction: 'up' | 'down') {
    const currentTemplate = getEditableDesignerTemplate();
    if (!currentTemplate || currentTemplate.schemas.length <= 1) return;
    const activePageIndex = Math.max(0, Math.min(getActivePdfmePageIndex(), currentTemplate.schemas.length - 1));
    const targetPageIndex = direction === 'up' ? activePageIndex - 1 : activePageIndex + 1;

    if (targetPageIndex < 0 || targetPageIndex >= currentTemplate.schemas.length) return;

    const nextOrder = currentTemplate.schemas.map((_pageSchemas, index) => index);
    const [moved] = nextOrder.splice(activePageIndex, 1);
    nextOrder.splice(targetPageIndex, 0, moved);
    const nextLocks = reorderLockKeys(lockedSchemaNamesRef.current, nextOrder);
    const nextTemplate = applyLocksToTemplate({
      ...currentTemplate,
      schemas: nextOrder.map((pageIndex) => currentTemplate.schemas[pageIndex] ?? []),
    } as PdfmeTemplate, nextLocks);

    await applyPendingTemplateChange(nextTemplate, nextLocks, `Hoja activa movida ${direction === 'up' ? 'arriba' : 'abajo'}. Presiona Guardar para confirmar el cambio.`);
  }

  function getActivePdfmePageIndex() {
    const pagerText = document.querySelector('.pdfme-ui-pager strong')?.textContent?.trim() ?? '';
    const pageNumber = Number(pagerText.split('/')[0]);
    return Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber - 1 : 0;
  }

  const prevSchemasRef = useRef<Record<string, string>>({});
  const lastLoadedTemplateIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!designerTemplate) {
      if (lockedSchemaNames.length > 0) {
        setLockedSchemaNames([]);
      }
      prevSchemasRef.current = {};
      lastLoadedTemplateIdRef.current = null;
      return;
    }
    const locked: string[] = [];
    const currentSchemas: Record<string, string> = {};
    const currentSchemaLockKeyByPosition: Record<string, string> = {};

    designerTemplate.schemas.forEach((pageSchemas, pageIndex) => {
      if (!Array.isArray(pageSchemas)) return;
      pageSchemas.forEach((schema, schemaIndex) => {
        if (!schema || !schema.name) return;
        const lockKey = getSchemaLockKey(pageIndex, schema.name);
        currentSchemas[lockKey] = schema.type || 'unknown';
        currentSchemaLockKeyByPosition[getSchemaPositionKey(pageIndex, schemaIndex)] = lockKey;
        if (schema.__isLocked) {
          locked.push(lockKey);
        }
      });
    });

    const currentTemplateId = editingTemplate?.id + '-' + editingTemplate?.versionId;
    if (lastLoadedTemplateIdRef.current !== currentTemplateId) {
      lastLoadedTemplateIdRef.current = currentTemplateId;
      setLockedSchemaNames(locked);
    }

    const prevSchemas = prevSchemasRef.current;
    prevSchemasRef.current = currentSchemas;
    previousSchemaLockKeyByPositionRef.current = currentSchemaLockKeyByPosition;

    // Apply the locking/unlocking styles and sidebar buttons
    const handleDOMUpdate = () => {
      const container = document.querySelector('.pdfme-workspace');
      if (!container) return;
      const liveTemplate = designerRef.current?.getTemplate() ?? designerTemplate;
      const parent = container.parentElement || document;

      // 1. Replace pdfme's page menu with a local menu that keeps changes pending until Save.
      if (!isPreviewRoute) {
        const pageCount = Array.isArray(liveTemplate.schemas) ? liveTemplate.schemas.length : 0;
        const controlBar = container.querySelector('.pdfme-ui-control-bar') as HTMLElement | null;
        const nativeMenuButton = controlBar?.querySelector('.pdfme-ui-context-menu') as HTMLElement | null;
        if (nativeMenuButton) nativeMenuButton.style.display = 'none';

        if (controlBar) {
          let pageMenuWrap = controlBar.querySelector('.pdfme-server-page-menu-wrap') as HTMLElement | null;
          if (!pageMenuWrap) {
            pageMenuWrap = document.createElement('span');
            pageMenuWrap.className = 'pdfme-server-page-menu-wrap';
            pageMenuWrap.innerHTML = `
              <button class="pdfme-server-page-menu-trigger" type="button" title="Opciones de hoja" aria-label="Opciones de hoja">
                ${renderLibraryIcon(EllipsisIcon, 16)}
              </button>
              <button class="pdfme-server-page-move-up-trigger" type="button" title="Mover hoja activa arriba" aria-label="Mover hoja activa arriba" hidden>
                ${renderLibraryIcon(ArrowUpIcon, 16)}
              </button>
              <button class="pdfme-server-page-move-down-trigger" type="button" title="Mover hoja activa abajo" aria-label="Mover hoja activa abajo" hidden>
                ${renderLibraryIcon(ArrowDownIcon, 16)}
              </button>
              <div class="pdfme-server-page-dropdown ant-dropdown ant-dropdown-placement-topRight" hidden>
                <ul class="pdfme-server-page-menu ant-dropdown-menu ant-dropdown-menu-root ant-dropdown-menu-vertical ant-dropdown-menu-light" role="menu"></ul>
              </div>
            `;
            controlBar.appendChild(pageMenuWrap);
          }

          const trigger = pageMenuWrap.querySelector('.pdfme-server-page-menu-trigger') as HTMLButtonElement | null;
          const moveUpTrigger = pageMenuWrap.querySelector('.pdfme-server-page-move-up-trigger') as HTMLButtonElement | null;
          const moveDownTrigger = pageMenuWrap.querySelector('.pdfme-server-page-move-down-trigger') as HTMLButtonElement | null;
          const dropdown = pageMenuWrap.querySelector('.pdfme-server-page-dropdown') as HTMLElement | null;
          const menu = pageMenuWrap.querySelector('.pdfme-server-page-menu') as HTMLElement | null;

          const activePageIndex = getActivePdfmePageIndex();
          if (moveUpTrigger) {
            moveUpTrigger.hidden = pageCount <= 1 || activePageIndex <= 0;
            if (moveUpTrigger.dataset.pdfmeServerPageMoveReady !== 'true') {
              moveUpTrigger.dataset.pdfmeServerPageMoveReady = 'true';
              moveUpTrigger.onclick = (event) => {
                event.stopPropagation();
                event.preventDefault();
                void moveActivePage('up');
              };
            }
          }

          if (moveDownTrigger) {
            moveDownTrigger.hidden = pageCount <= 1 || activePageIndex >= pageCount - 1;
            if (moveDownTrigger.dataset.pdfmeServerPageMoveReady !== 'true') {
              moveDownTrigger.dataset.pdfmeServerPageMoveReady = 'true';
              moveDownTrigger.onclick = (event) => {
                event.stopPropagation();
                event.preventDefault();
                void moveActivePage('down');
              };
            }
          }

          if (trigger && dropdown && menu) {
            const openPageIndex = Number(pageMenuWrap.dataset.pdfmeServerOpenPageIndex);
            if (!dropdown.hidden && Number.isFinite(openPageIndex) && openPageIndex !== activePageIndex) {
              dropdown.hidden = true;
              trigger.classList.remove('is-open');
              trigger.setAttribute('aria-expanded', 'false');
              delete pageMenuWrap.dataset.pdfmeServerOpenPageIndex;
            }

            menu.innerHTML = '';
            const addMenuItem = (label: string, action: 'insert-before' | 'insert-after' | 'delete') => {
              const item = document.createElement('li');
              item.className = 'pdfme-server-page-menu-item ant-dropdown-menu-item ant-dropdown-menu-item-only-child';
              item.role = 'menuitem';
              item.tabIndex = -1;
              item.dataset.pdfmeServerPageAction = action;
              const icon = action === 'delete'
                ? renderLibraryIcon(DeleteIcon, 14)
                : action === 'insert-before'
                  ? renderLibraryIcon(VerticalAlignTopIcon, 14)
                  : renderLibraryIcon(VerticalAlignBottomIcon, 14);
              item.innerHTML = `<span class="ant-dropdown-menu-title-content pdfme-server-page-menu-content"><span class="pdfme-server-page-menu-icon">${icon}</span><span>${label}</span></span>`;
              const runPageAction = (event: Event) => {
                event.stopPropagation();
                event.preventDefault();
                if (item.dataset.pdfmeServerPageActionRunning === 'true') return;
                item.dataset.pdfmeServerPageActionRunning = 'true';
                dropdown.hidden = true;
                trigger.classList.remove('is-open');
                trigger.setAttribute('aria-expanded', 'false');
                const targetPageIndex = Number(pageMenuWrap.dataset.pdfmeServerOpenPageIndex);
                delete pageMenuWrap.dataset.pdfmeServerOpenPageIndex;
                const safeTargetPageIndex = Number.isFinite(targetPageIndex) ? targetPageIndex : getActivePdfmePageIndex();
                if (action === 'insert-before') {
                  void insertPageBefore(safeTargetPageIndex);
                  window.setTimeout(() => { delete item.dataset.pdfmeServerPageActionRunning; }, 400);
                  return;
                }
                if (action === 'insert-after') {
                  void insertPageAfter(safeTargetPageIndex);
                  window.setTimeout(() => { delete item.dataset.pdfmeServerPageActionRunning; }, 400);
                  return;
                }
                void deletePage(safeTargetPageIndex);
                window.setTimeout(() => { delete item.dataset.pdfmeServerPageActionRunning; }, 400);
              };
              item.onpointerdown = runPageAction;
              item.onmousedown = runPageAction;
              item.onclick = runPageAction;
              menu.appendChild(item);
            };

            addMenuItem('Insertar página arriba', 'insert-before');
            addMenuItem('Insertar página abajo', 'insert-after');
            if (pageCount > 1) addMenuItem('Eliminar página actual', 'delete');

            if (trigger.dataset.pdfmeServerPageMenuReady !== 'true') {
              trigger.dataset.pdfmeServerPageMenuReady = 'true';
              trigger.onclick = (event) => {
                event.stopPropagation();
                event.preventDefault();
                const willOpen = dropdown.hidden;
                dropdown.hidden = !willOpen;
                trigger.classList.toggle('is-open', willOpen);
                trigger.setAttribute('aria-expanded', String(willOpen));
                if (willOpen) {
                  pageMenuWrap.dataset.pdfmeServerOpenPageIndex = String(getActivePdfmePageIndex());
                } else {
                  delete pageMenuWrap.dataset.pdfmeServerOpenPageIndex;
                }
              };
            }
          }
        }
      }

      // 2. Mark locked canvas elements without mutating pdfme's internal selectable class.
      // pdfme uses `.selectable` for drag/measurement; removing it during pointer moves can
      // trigger an updateRect -> setState loop in its internal resize observer.
      liveTemplate.schemas.forEach((pageSchemas, pageIndex) => {
        if (!Array.isArray(pageSchemas)) return;
        pageSchemas.forEach((schema, schemaIndex) => {
          if (!schema || !schema.name) return;
          const el = container.querySelector(`div[title="${schema.name}"]`) as HTMLElement | null;
          if (!el) return;

          const isLocked = isSchemaLocked(pageIndex, schema.name, schemaIndex);

          if (isLocked) {
            if (!el.classList.contains('selectable-locked')) {
              el.classList.add('selectable-locked');
            }
          } else {
            if (el.classList.contains('selectable-locked')) {
              el.classList.remove('selectable-locked');
            }
          }

          const legacyBtn = el.querySelector('.canvas-lock-btn');
          if (legacyBtn) legacyBtn.remove();
        });
      });

      // 3. Render lock/unlock buttons in the visible sidebar element list.
      // pdfme reuses this DOM when switching pages, so handlers and metadata must be
      // refreshed every pass instead of only when the button is first created.
      const listView = parent.querySelector('.pdfme-designer-list-view') as HTMLElement | null;
      const injectedRows = listView?.querySelectorAll('.schema-sidebar-row') ?? [];
      const fallbackItems = injectedRows.length > 0 ? [] : (listView?.querySelectorAll('ul > li') ?? []);
      const rowElements = injectedRows.length > 0
        ? Array.from(injectedRows)
        : Array.from(fallbackItems).map((li) => li.firstElementChild).filter(Boolean);
      const rows = rowElements.map((element) => {
        const rowDiv = element as HTMLDivElement;
        const span = (rowDiv?.querySelector('span[title="Editar"]') || rowDiv?.querySelector('span[title="Edit"]')) as HTMLSpanElement | null;
        const schemaName = rowDiv.dataset.pdfmeSchemaName || span?.textContent?.trim() || '';
        return { rowDiv, schemaName, span };
      }).filter((row): row is { rowDiv: HTMLDivElement; schemaName: string; span: HTMLSpanElement } => Boolean(row.rowDiv && row.schemaName && row.span));

      const visibleNames = new Set(rows.map((row) => row.schemaName));
      let activePageIndex = 0;
      let activePageMatches = -1;
      liveTemplate.schemas.forEach((pageSchemas, pageIndex) => {
        if (!Array.isArray(pageSchemas)) return;
        const matches = pageSchemas.reduce((count, schema) => count + (schema.name && visibleNames.has(schema.name) ? 1 : 0), 0);
        if (matches > activePageMatches) {
          activePageMatches = matches;
          activePageIndex = pageIndex;
        }
      });

      rows.forEach(({ rowDiv, schemaName }) => {
        const activePageSchemas = liveTemplate.schemas[activePageIndex];
        let foundSchemaIndex = Array.isArray(activePageSchemas) ? activePageSchemas.findIndex((schema) => schema.name === schemaName) : -1;
        let foundPageIndex = foundSchemaIndex !== -1
          ? activePageIndex
          : -1;

        if (foundPageIndex === -1) {
          liveTemplate.schemas.forEach((pageSchemas, pageIndex) => {
            if (foundPageIndex !== -1 || !Array.isArray(pageSchemas)) return;
            const schemaIndex = pageSchemas.findIndex((schema) => schema.name === schemaName);
            if (schemaIndex !== -1) {
              foundPageIndex = pageIndex;
              foundSchemaIndex = schemaIndex;
            }
          });
        }

        if (foundPageIndex === -1) return;

        const isLocked = isSchemaLocked(foundPageIndex, schemaName, foundSchemaIndex);
        const desiredTitle = isLocked ? 'Desbloquear' : 'Bloquear';
        const desiredState = isLocked ? 'locked' : 'unlocked';

        rowDiv.classList.add('schema-sidebar-row');
        if (!rowDiv.dataset.pdfmeSchemaName) {
          rowDiv.dataset.pdfmeSchemaName = schemaName;
        }

        rowDiv.dataset.schemaLocked = isLocked ? 'true' : 'false';
        const blockLockedRowAction = (event: MouseEvent) => {
          if (rowDiv.dataset.schemaLocked !== 'true') return;
          if ((event.target as HTMLElement | null)?.closest('.sidebar-lock-btn')) return;
          event.stopPropagation();
          event.preventDefault();
        };
        rowDiv.onmousedown = blockLockedRowAction;
        rowDiv.onmouseup = blockLockedRowAction;
        rowDiv.onclick = blockLockedRowAction;

        let lockBtn = rowDiv.querySelector('.sidebar-lock-btn') as HTMLButtonElement | null;
        if (!lockBtn) {
          lockBtn = document.createElement('button');
          lockBtn.className = 'sidebar-lock-btn';
          lockBtn.type = 'button';

          rowDiv.appendChild(lockBtn);
        }

        lockBtn.dataset.pageIndex = String(foundPageIndex);
        lockBtn.dataset.schemaName = schemaName;
        lockBtn.onmousedown = (event) => {
          event.stopPropagation();
          event.preventDefault();
          toggleLockSchema(foundPageIndex, schemaName, foundSchemaIndex);
        };
        lockBtn.onmouseup = (event) => {
          event.stopPropagation();
          event.preventDefault();
        };
        lockBtn.onclick = (event) => {
          event.stopPropagation();
          event.preventDefault();
        };

        if (lockBtn.getAttribute('data-state') !== desiredState || !lockBtn.innerHTML.trim()) {
          lockBtn.setAttribute('data-state', desiredState);
          lockBtn.title = desiredTitle;
          lockBtn.innerHTML = renderLibraryIcon(isLocked ? LockIcon : UnlockIcon, 16);
        }
      });
    };

    handleDOMUpdate();
    const t1 = setTimeout(handleDOMUpdate, 50);
    const t2 = setTimeout(handleDOMUpdate, 200);

    let frameId: number;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        handleDOMUpdate();
      });
    });

    const workspaceEl = document.querySelector('.pdfme-workspace');
    const observedEl = workspaceEl?.parentElement || workspaceEl;
    if (observedEl) {
      observer.observe(observedEl, {
        childList: true,
        subtree: true,
      });
    }

    const scheduleDOMUpdate = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        handleDOMUpdate();
      });
    };

    const closePageMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.pdfme-server-page-menu-wrap')) return;
      document.querySelectorAll('.pdfme-server-page-dropdown').forEach((dropdown) => {
        (dropdown as HTMLElement).hidden = true;
      });
      document.querySelectorAll('.pdfme-server-page-menu-trigger.is-open').forEach((trigger) => {
        trigger.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      });
    };

    observedEl?.addEventListener('click', scheduleDOMUpdate, true);
    observedEl?.addEventListener('pointerup', scheduleDOMUpdate, true);
    observedEl?.addEventListener('keyup', scheduleDOMUpdate, true);
    document.addEventListener('mousedown', closePageMenu, true);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      cancelAnimationFrame(frameId);
      observedEl?.removeEventListener('click', scheduleDOMUpdate, true);
      observedEl?.removeEventListener('pointerup', scheduleDOMUpdate, true);
      observedEl?.removeEventListener('keyup', scheduleDOMUpdate, true);
      document.removeEventListener('mousedown', closePageMenu, true);
      observer.disconnect();
    };
  }, [designerTemplate, lockedSchemaNames, editingTemplate, isPreviewRoute, saving, switchingVersion]);

  async function toggleLockSchema(pageIndex: number, schemaName: string, schemaIndex?: number) {
    if (!editingTemplate) return;

    const lockKey = getSchemaLockKey(pageIndex, schemaName);
    const previousLockKey = typeof schemaIndex === 'number'
      ? previousSchemaLockKeyByPositionRef.current[getSchemaPositionKey(pageIndex, schemaIndex)]
      : undefined;
    const currentLocks = lockedSchemaNamesRef.current;
    const exists = currentLocks.includes(lockKey) || Boolean(previousLockKey && currentLocks.includes(previousLockKey));
    const nextLocks = exists
      ? currentLocks.filter((name) => name !== lockKey && name !== previousLockKey)
      : [...currentLocks, lockKey];
    const currentTemplate = getEditableDesignerTemplate();
    const previousTemplate = designerTemplate;

    lockedSchemaNamesRef.current = nextLocks;
    setLockedSchemaNames(nextLocks);
    if (!currentTemplate) return;

    const nextTemplate = applyLocksToTemplate(currentTemplate, nextLocks);
    designerRef.current?.updateTemplate(nextTemplate);
    setDesignerTemplate(nextTemplate);

    try {
      const payload = await apiRequest<{ template: TemplateItem }>(`/api/templates/${editingTemplate.id}/schema-locks`, {
        method: 'PATCH',
        body: JSON.stringify({ lockedSchemaNames: nextLocks }),
      });
      setEditingTemplate(payload.template);
      refreshLockStateFromTemplate(buildPdfmeTemplate(payload.template));
    } catch (err) {
      lockedSchemaNamesRef.current = currentLocks;
      setLockedSchemaNames(currentLocks);
      if (previousTemplate) {
        designerRef.current?.updateTemplate(previousTemplate);
        setDesignerTemplate(previousTemplate);
      }
      notifyError(err, 'No se pudo guardar el bloqueo en la base de datos.');
    }
  }

  function getSchemaIcon(type: string) {
    switch (type) {
      case 'text':
        return <span className="schema-type-icon schema-type-icon-text">T</span>;
      case 'image':
        return <PictureOutlined className="schema-type-icon" />;
      case 'qrcode':
      case 'code128':
        return <BarcodeOutlined className="schema-type-icon" />;
      default:
        return <FileTextOutlined className="schema-type-icon" />;
    }
  }

  useEffect(() => {
    if (routeCode && !editingTemplate) {
      setHeaderAction(null);
      setHeaderControls(null);
      return;
    }

    if (!editingTemplate) {
      setHeaderControls(
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
          <Typography variant="h5" color="text.primary" sx={{ minWidth: { xs: 0, md: 160 }, display: { xs: 'none', sm: 'block' } }} noWrap>
            Plantillas
          </Typography>
          <TextField
            fullWidth
            label="Buscar plantilla"
            onChange={(event) => { setSearch(event.target.value); setPage(0); }}
            placeholder="Nombre o codigo"
            size="small"
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchOutlined /></InputAdornment> } }}
            sx={{ maxWidth: 360 }}
            value={search}
          />
          <Autocomplete
            onChange={(_event, value) => { setTagFilter(value ?? ''); setPage(0); }}
            options={availableTags.map((tag) => tag.name)}
            renderInput={(params) => <TextField {...params} label="Etiqueta" placeholder="Todas" size="small" />}
            sx={{ maxWidth: 220, minWidth: { xs: 160, md: 200 } }}
            value={tagFilter || null}
          />
          <Box sx={{ flexGrow: 1 }} />
          {can(user, 'templates.create') ? <Button onClick={openHeaderAction} size="small" variant="contained">Agregar</Button> : null}
        </Stack>,
      );
      return;
    }

    setHeaderAction(null);
    setHeaderControls(
      <EditorHeaderControls
        editingTemplate={editingTemplate}
        hasMultipleVersions={hasMultipleVersions}
        isPreviewRoute={isPreviewRoute}
        onBack={() => navigate('/templates')}
        onEditPreview={() => navigate(`/templates/edit/${editingTemplate.code}`)}
        onFormatChange={setFormat}
        onHeightChange={(next) => { setPageHeightMm(next); setDesignerTemplate((current) => updatePdfmeBasePdf(current, { height: next })); }}
        onOpenDetails={openDetailsDialog}
        onOpenInputs={openInputsDialog}
        onOpenVersions={() => setVersionsDialogOpen(true)}
        onSave={() => { void saveSettings(); }}
        onSaveVersion={() => { void saveVersion(); }}
        onToggleOrientation={toggleOrientation}
        onWidthChange={(next) => { setPageWidthMm(next); setDesignerTemplate((current) => updatePdfmeBasePdf(current, { width: next })); }}
        pageFormat={pageFormat}
        pageHeightMm={pageHeightMm}
        pageOrientation={pageOrientation}
        pageWidthMm={pageWidthMm}
        saving={saving}
        savingDetails={savingDetails}
        savingVersion={savingVersion}
        switchingVersion={switchingVersion}
      />,
    );

    return () => setHeaderControls(null);
  }, [availableTags, designerTemplate?.schemas?.length, editingTemplate, hasMultipleVersions, isPreviewRoute, navigate, pageFormat, pageHeightMm, pageOrientation, pageWidthMm, saving, savingDetails, savingVersion, search, setHeaderControls, switchingVersion, tagFilter, user]);

  useEffect(() => {
    const originalConfirm = window.confirm;
    window.confirm = (message) => {
      const msg = message ? message.toLowerCase() : '';
      if (msg.includes('page') || msg.includes('página') || msg.includes('delete') || msg.includes('eliminar')) {
        return true;
      }
      return originalConfirm(message);
    };
    return () => {
      window.confirm = originalConfirm;
    };
  }, []);



  const detailsDialog = (
    <AppFormDialog
      actions={(
        <>
          <Button onClick={() => { setDetailsDialogOpen(false); setDetailsTemplate(null); }}>Cancelar</Button>
          <Button disabled={savingDetails || detailsName.trim().length < 2 || !detailsCode.trim()} onClick={() => void saveDetails()} variant="contained">
            Guardar
          </Button>
        </>
      )}
      maxWidth="sm"
      onClose={() => { setDetailsDialogOpen(false); setDetailsTemplate(null); }}
      open={detailsDialogOpen}
      title={detailsMode === 'tags' ? 'Retiquetar plantilla' : 'Datos de plantilla'}
    >
      <Stack spacing={2}>
        {detailsMode === 'details' ? (
          <>
            <TextField fullWidth label="Nombre" onChange={(event) => setDetailsName(event.target.value)} value={detailsName} />
            <TextField fullWidth helperText="Identificador usado por apps/API." label="Codigo" onChange={(event) => setDetailsCode(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} value={detailsCode} />
          </>
        ) : null}
        <Autocomplete
          freeSolo
          multiple
          onChange={(_event, value) => setDetailsTags(Array.from(new Set(value.map((tag) => tag.trim()).filter(Boolean))))}
          options={availableTags.map((tag) => tag.name)}
          renderInput={(params) => <TextField {...params} helperText="Selecciona o escribe tags." label="Tags" />}
          value={detailsTags}
        />
      </Stack>
    </AppFormDialog>
  );
  if (routeCode && (loadingTemplate || !editingTemplate)) {
    return (
      <Box sx={{ display: 'grid', height: '100%', minHeight: 0, placeItems: 'center', width: '100%' }}>
        {error ? <Typography color="text.secondary">{error}</Typography> : <LoadingState label="Cargando plantilla..." minHeight="100%" />}
      </Box>
    );
  }

  if (editingTemplate) {
    return (
      <Box sx={{ height: '100%', minHeight: 0, position: 'relative', width: '100%' }}>
        <Dialog fullWidth maxWidth="sm" onClose={() => setVersionsDialogOpen(false)} open={versionsDialogOpen}>
          <DialogTitle>Cambiar version</DialogTitle>
          <DialogContent dividers sx={{ maxHeight: '70vh', p: 0 }}>
            <List disablePadding>
              {editingTemplateVersions.map((version) => (
                <ListItemButton
                  disabled={version.id === editingTemplate.versionId || switchingVersion || deletingVersionId === version.id}
                  key={version.id}
                  onClick={() => void switchVersion(version.id)}
                  selected={version.id === editingTemplate.versionId}
                >
                  <ListItemText
                    primary={`Version ${version.versionNumber}`}
                    secondary={`${version.pageCount} hoja${version.pageCount === 1 ? '' : 's'} · ${new Date(version.updatedAt).toLocaleString()}`}
                  />
                  <Button
                    color="error"
                    disabled={editingTemplateVersions.length <= 1 || deletingVersionId === version.id || switchingVersion}
                    onClick={(event) => {
                      event.stopPropagation();
                      void confirmDeleteVersion(version.id, version.versionNumber);
                    }}
                    size="small"
                    startIcon={<DeleteOutlined />}
                  >
                    Eliminar
                  </Button>
                </ListItemButton>
              ))}
            </List>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setVersionsDialogOpen(false)}>Cerrar</Button>
          </DialogActions>
        </Dialog>
        <Dialog
          className="input-export-dialog"
          fullWidth
          maxWidth="lg"
          onClose={() => setInputsDialogOpen(false)}
          open={inputsDialogOpen}
          sx={{
            '--input-export-bg': theme.palette.background.default,
            '--input-export-paper': theme.palette.background.paper,
            '--input-export-paper-soft': theme.palette.action.hover,
            '--input-export-border': theme.palette.divider,
            '--input-export-border-strong': alpha(theme.palette.divider, theme.palette.mode === 'dark' ? 0.9 : 1),
            '--input-export-text': theme.palette.text.primary,
            '--input-export-muted': theme.palette.text.secondary,
            '--input-export-primary': theme.palette.primary.main,
            '& .MuiDialog-paper': { maxHeight: 'calc(100dvh - 32px)', width: { sm: 'min(1100px, calc(100vw - 32px))' } },
          }}
        >
          <DialogTitle className="input-export-title">Variables y objetos cambiables</DialogTitle>
          <DialogContent className="input-export-dialogContent" dividers sx={{ p: 0 }}>
            <Stack className="input-export-body" spacing={1.5}>
              <Box className="input-export-section">
                <Stack className="input-export-sectionHeader" direction="row" spacing={1}>
                  <Typography sx={{ fontWeight: 700 }} variant="subtitle2">Entradas detectadas</Typography>
                  <Typography className="input-export-total" variant="caption">
                    {inputsSnapshot.variables.length + inputsSnapshot.objects.length} entradas
                  </Typography>
                </Stack>
                <Box className="input-export-gridPanel">
                  <Grid
                    columns={[
                      {
                        name: 'Tipo',
                        formatter: (cell) => h('span', { className: 'input-export-textCell' }, String(cell ?? '')),
                      },
                      {
                        name: 'Clave',
                        formatter: (cell) => h('code', { className: 'input-export-key' }, String(cell ?? '')),
                      },
                      {
                        name: 'Hojas',
                        formatter: (cell) => h('span', { className: 'input-export-pages' }, String(cell ?? '')),
                      },
                      {
                        name: 'Cantidad',
                        sort: false,
                        formatter: (cell) => h('span', { className: 'input-export-numberCell' }, String(cell ?? '')),
                      },
                    ]}
                    data={getInputsRows(inputsSnapshot).map((item) => [
                      item.sourceType,
                      item.key,
                      item.pages.join(', '),
                      item.schemaNames.length,
                    ])}
                    height="min(42dvh, 360px)"
                    sort
                  />
                </Box>
              </Box>
              <Divider className="input-export-divider" />
              <Box className="input-export-section">
                <Stack className="input-export-sectionHeader" direction="row" spacing={1}>
                  <Typography sx={{ fontWeight: 700 }} variant="subtitle2">JSON para API</Typography>
                </Stack>
                <Box
                  className="input-export-json"
                  component="pre"
                >{buildInputsJson(inputsSnapshot)}</Box>
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions className="input-export-actions">
            <Button onClick={() => setInputsDialogOpen(false)}>Cerrar</Button>
            <Button
              onClick={() => void copyTextToClipboard(buildInputsJson(inputsSnapshot), 'JSON copiado.')}
              startIcon={<CodeOutlined />}
              variant="contained"
            >
              Copiar JSON
            </Button>
          </DialogActions>
        </Dialog>
        {detailsDialog}
        <Backdrop
          open={editorBusy}
          sx={{
            bgcolor: 'rgba(0, 0, 0, 0.72)',
            color: '#ffffff',
            display: 'grid',
            placeItems: 'center',
            zIndex: (theme) => theme.zIndex.modal + 10,
          }}
        >
          <Stack spacing={1.5} sx={{ alignItems: 'center' }}>
            <CircularProgress color="inherit" size={34} thickness={4} />
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }}>{editorBusyLabel}</Typography>
          </Stack>
        </Backdrop>
        <Box className="pdfme-workspace" sx={{ height: '100%', minHeight: 0, width: '100%' }}>
          <Card sx={{ bgcolor: 'background.default', borderRadius: 0, boxShadow: 'none', height: '100%', minWidth: 0, overflow: 'hidden' }}>
            {designerTemplate ? (
              <Suspense fallback={null}>
                {isPreviewRoute ? <PdfmeViewer key={designerWorkspaceKey} mode={mode} template={designerTemplate} /> : <PdfmeDesigner key={designerWorkspaceKey} mode={mode} ref={designerRef} template={designerTemplate} />}
              </Suspense>
            ) : <LoadingState label="Preparando plantilla..." minHeight="100%" />}
          </Card>
        </Box>
      </Box>
    );
  }

  return (
    <>
    <Stack spacing={2} sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Card sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0, p: 0 }}>
        {loading ? (
          <LoadingState label="Cargando plantillas..." minHeight="100%" />
        ) : filteredTemplates.length === 0 ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 6, flexGrow: 1 }}>
            <Typography>No hay plantillas.</Typography>
          </Box>
        ) : (
          <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <DataTable
              columns={['Plantilla', 'Version', 'Hoja', 'Tags', { name: 'Acciones', sort: false }]}
              data={filteredTemplates.slice(page * rowsPerPage, (page + 1) * rowsPerPage).map((template) => [
                <Box key="n"><strong>{template.name}</strong><br /><small>{template.code}</small></Box>,
                `v${template.versionNumber}`,
                `${template.pageFormat} ${template.pageOrientation === 'LANDSCAPE' ? 'Horizontal' : 'Vertical'}`,
                template.tags.join(', ') || 'Sin etiquetas',
                <Stack key="a" direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                  <Button onClick={() => navigate(`/templates/preview/${template.code}`)} size="small" startIcon={<EyeOutlined />}>Preview</Button>
                  <Button onClick={() => navigate(`/templates/edit/${template.code}`)} size="small" startIcon={<EditOutlined />}>Editar</Button>
                  {can(user, 'templates.edit') ? (
                    <Button onClick={() => openDetailsDialog(template)} size="small" startIcon={<UnorderedListOutlined />}>Propiedades</Button>
                  ) : null}
                  {can(user, 'templates.create') ? (
                    <Button disabled={duplicatingId === template.id} onClick={() => void duplicate(template)} size="small" startIcon={<CopyOutlined />}>Duplicar</Button>
                  ) : null}
                  {can(user, 'templates.delete') ? (
                    <Button color="error" disabled={deletingId === template.id} onClick={() => void confirmRemove(template)} size="small" startIcon={<DeleteOutlined />}>
                      Eliminar
                    </Button>
                  ) : null}
                </Stack>,
              ])}
            />
            <PaginationBar page={page} setPage={setPage} rowsPerPage={rowsPerPage} setRowsPerPage={setRowsPerPage} total={filteredTemplates.length} />
          </Box>
        )}
      </Card>
    </Stack>
    {detailsDialog}
    </>
  );
}
