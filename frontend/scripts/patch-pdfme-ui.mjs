import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDir, '..');
const packageJsonPath = resolve(frontendRoot, 'node_modules/@pdfme/ui/package.json');
const distPath = resolve(frontendRoot, 'node_modules/@pdfme/ui/dist/index.js');
const viteOptimizedPath = resolve(frontendRoot, 'node_modules/.vite/deps/@pdfme_ui.js');
const viteMetadataPath = resolve(frontendRoot, 'node_modules/.vite/deps/_metadata.json');

const expectedPdfmeVersion = '6.1.11';
const pastePositionPatchMarker = 'pdfme-server patch: paste schemas at their original coordinates';
const copySnapshotPatchMarker = 'pdfme-server patch: snapshot copied schemas';
const pasteClipboardPatchMarker = 'pdfme-server patch: keep copied schemas stable after paste';
const listRowPatchMarker = 'pdfme-server patch: expose stable schema sidebar rows';
const selectoTargetPatchMarker = 'pdfme-server patch: ignore locked schemas during drag selection';
const pageContextMenuPatchMarker = 'pdfme-server patch: show page remove only when more than one page';
const pageInsertPatchMarker = 'pdfme-server patch: insert pages before the current page';
const pageRemovePatchMarker = 'pdfme-server patch: allow removing any page when more than one page remains';

const pdfmeRuntimeInjectors = [
  { packageName: '@pdfme/ui', expectedVersion: expectedPdfmeVersion, patchTarget: true },
  { packageName: '@pdfme/common', expectedVersion: expectedPdfmeVersion },
  { packageName: '@pdfme/schemas', expectedVersion: expectedPdfmeVersion },
  { packageName: '@pdfme/converter', expectedVersion: expectedPdfmeVersion },
  { packageName: '@pdfme/pdf-lib', expectedVersion: expectedPdfmeVersion },
  { packageName: 'fontkit', expectedVersion: '2.0.4' },
  { packageName: 'form-render', expectedVersion: '2.5.6' },
  { packageName: 'antd', expectedVersion: '5.29.3' },
  { packageName: 'react-moveable', expectedVersion: '0.56.0' },
  { packageName: 'react-selecto', expectedVersion: '1.26.3' },
  { packageName: '@scena/react-guides', expectedVersion: '0.28.2' },
  { packageName: '@dnd-kit/core', expectedVersion: '6.3.1' },
  { packageName: '@dnd-kit/sortable', expectedVersion: '10.0.0' },
  { packageName: '@dnd-kit/utilities', expectedVersion: '3.2.2' },
  { packageName: 'lucide-react', expectedVersion: '0.525.0' },
  { packageName: 'lucide', expectedVersion: '1.23.0' },
  { packageName: 'pdfjs-dist', optional: true },
];

const originalDistSnippet = `					const position = {
						x: p.x + 10 > ps.width - width ? ps.width - width : p.x + 10,
						y: p.y + 10 > ps.height - height ? ps.height - height : p.y + 10
					};`;

const patchedDistSnippet = `					// ${pastePositionPatchMarker}.
					const position = {
						x: Math.max(0, Math.min(p.x, ps.width - width)),
						y: Math.max(0, Math.min(p.y, ps.height - height))
					};`;

const outdatedPatchedDistSnippet = `					// ${pastePositionPatchMarker}.
					const position = {
						x: Math.min(Math.max(p.x, 0), ps.width - width),
						y: Math.min(Math.max(p.y, 0), ps.height - height)
					};`;

const originalViteSnippet = `          const position2 = {
            x: p.x + 10 > ps.width - width ? ps.width - width : p.x + 10,
            y: p.y + 10 > ps.height - height ? ps.height - height : p.y + 10
          };`;

const patchedViteSnippet = `          // ${pastePositionPatchMarker}.
          const position2 = {
            x: Math.max(0, Math.min(p.x, ps.width - width)),
            y: Math.max(0, Math.min(p.y, ps.height - height))
          };`;

const outdatedPatchedViteSnippet = `          // ${pastePositionPatchMarker}.
          const position2 = {
            x: Math.min(Math.max(p.x, 0), ps.width - width),
            y: Math.min(Math.max(p.y, 0), ps.height - height)
          };`;

const originalDistCopySnippet = `				copiedSchemas.current = activeSchemas;`;

const patchedDistCopySnippet = `				// ${copySnapshotPatchMarker}.
				copiedSchemas.current = cloneDeep$1(activeSchemas);`;

const originalViteCopySnippet = `        copiedSchemas.current = activeSchemas;`;

const patchedViteCopySnippet = `        // ${copySnapshotPatchMarker}.
        copiedSchemas.current = cloneDeep$1(activeSchemas);`;

const originalDistClipboardSnippet = `				copiedSchemas.current = pasteSchemas;`;

const patchedDistClipboardSnippet = `				// ${pasteClipboardPatchMarker}.`;

const originalViteClipboardSnippet = `        copiedSchemas.current = pasteSchemas;`;

const patchedViteClipboardSnippet = `        // ${pasteClipboardPatchMarker}.`;

const originalDistListRowSnippet = `			...props,
			onClick: () => onClick && onClick(),`;

const patchedDistListRowSnippet = `			...props,
			// ${listRowPatchMarker}.
			className: "schema-sidebar-row",
			"data-pdfme-schema-name": value,
			onClick: () => onClick && onClick(),`;

const originalViteListRowSnippet = `      ...props,
      onClick: () => onClick && onClick(),`;

const patchedViteListRowSnippet = `      ...props,
      // ${listRowPatchMarker}.
      className: "schema-sidebar-row",
      "data-pdfme-schema-name": value,
      onClick: () => onClick && onClick(),`;

const originalDistSelectoTargetSnippet = `		selectableTargets: [\`.\${SELECTABLE_CLASSNAME}\`],`;

const patchedDistSelectoTargetSnippet = `		// ${selectoTargetPatchMarker}.
		selectableTargets: [\`.\${SELECTABLE_CLASSNAME}:not(.selectable-locked)\`],`;

const originalViteSelectoTargetSnippet = `    selectableTargets: [\`.\${SELECTABLE_CLASSNAME}\`],`;

const patchedViteSelectoTargetSnippet = `    // ${selectoTargetPatchMarker}.
    selectableTargets: [\`.\${SELECTABLE_CLASSNAME}:not(.selectable-locked)\`],`;

const originalDistPageMenuSnippet = `	if (removePage && pageNum > 1 && pageCursor !== 0) contextMenuItems.push({`;

const previousPatchedDistPageMenuSnippet = `	// pdfme-server patch: show page remove only when more than two pages.
	if (removePage && pageNum > 2) contextMenuItems.push({`;

const previousUnmarkedDistPageMenuSnippet = `	if (removePage && pageNum > 2) contextMenuItems.push({`;

const patchedDistPageMenuSnippet = `	// ${pageContextMenuPatchMarker}.
	if (removePage && pageNum > 1) contextMenuItems.push({`;

const originalVitePageMenuSnippet = `  if (removePage && pageNum > 1 && pageCursor !== 0) contextMenuItems.push({`;

const previousPatchedVitePageMenuSnippet = `  // pdfme-server patch: show page remove only when more than two pages.
  if (removePage && pageNum > 2) contextMenuItems.push({`;

const previousUnmarkedVitePageMenuSnippet = `  if (removePage && pageNum > 2) contextMenuItems.push({`;

const patchedVitePageMenuSnippet = `  // ${pageContextMenuPatchMarker}.
  if (removePage && pageNum > 1) contextMenuItems.push({`;

const originalDistPageInsertSnippet = `	const handleAddPageAfter = () => {
		const _schemasList = cloneDeep$1(schemasList);
		_schemasList.splice(pageCursor + 1, 0, []);
		updatePage(_schemasList, pageCursor + 1);
	};`;

const patchedDistPageInsertSnippet = `	const handleAddPageAfter = () => {
		// ${pageInsertPatchMarker}.
		const _schemasList = cloneDeep$1(schemasList);
		_schemasList.splice(pageCursor, 0, []);
		updatePage(_schemasList, pageCursor);
	};`;

const originalVitePageInsertSnippet = `  const handleAddPageAfter = () => {
    const _schemasList = cloneDeep$1(schemasList);
    _schemasList.splice(pageCursor + 1, 0, []);
    updatePage(_schemasList, pageCursor + 1);
  };`;

const patchedVitePageInsertSnippet = `  const handleAddPageAfter = () => {
    // ${pageInsertPatchMarker}.
    const _schemasList = cloneDeep$1(schemasList);
    _schemasList.splice(pageCursor, 0, []);
    updatePage(_schemasList, pageCursor);
  };`;

const originalDistPageRemoveSnippet = `	const handleRemovePage = () => {
		if (pageCursor === 0) return;
		if (!window.confirm(i18n("removePageConfirm"))) return;
		const _schemasList = cloneDeep$1(schemasList);
		_schemasList.splice(pageCursor, 1);
		updatePage(_schemasList, pageCursor - 1);
	};`;

const previousPatchedDistPageRemoveSnippet = `	const handleRemovePage = () => {
		// pdfme-server patch: allow removing any page when more than two pages remain.
		if (schemasList.length <= 2) return;
		if (!window.confirm(i18n("removePageConfirm"))) return;
		const _schemasList = cloneDeep$1(schemasList);
		_schemasList.splice(pageCursor, 1);
		updatePage(_schemasList, Math.max(0, pageCursor - 1));
	};`;

const previousPatchedDistPageRemoveMarkerSnippet = `	const handleRemovePage = () => {
		// pdfme-server patch: allow removing any page when more than two pages remain.
		if (schemasList.length <= 1) return;
		if (!window.confirm(i18n("removePageConfirm"))) return;
		const _schemasList = cloneDeep$1(schemasList);
		_schemasList.splice(pageCursor, 1);
		updatePage(_schemasList, Math.max(0, pageCursor - 1));
	};`;

const previousUnmarkedDistPageRemoveSnippet = `	const handleRemovePage = () => {
		if (schemasList.length <= 2) return;
		if (!window.confirm(i18n("removePageConfirm"))) return;
		const _schemasList = cloneDeep$1(schemasList);
		_schemasList.splice(pageCursor, 1);
		updatePage(_schemasList, Math.max(0, pageCursor - 1));
	};`;

const patchedDistPageRemoveSnippet = `	const handleRemovePage = () => {
		// ${pageRemovePatchMarker}.
		if (schemasList.length <= 1) return;
		if (!window.confirm(i18n("removePageConfirm"))) return;
		const _schemasList = cloneDeep$1(schemasList);
		_schemasList.splice(pageCursor, 1);
		updatePage(_schemasList, Math.max(0, pageCursor - 1));
	};`;

const originalVitePageRemoveSnippet = `  const handleRemovePage = () => {
    if (pageCursor === 0) return;
    if (!window.confirm(i18n2("removePageConfirm"))) return;
    const _schemasList = cloneDeep$1(schemasList);
    _schemasList.splice(pageCursor, 1);
    updatePage(_schemasList, pageCursor - 1);
  };`;

const previousPatchedVitePageRemoveSnippet = `  const handleRemovePage = () => {
    // pdfme-server patch: allow removing any page when more than two pages remain.
    if (schemasList.length <= 2) return;
    if (!window.confirm(i18n2("removePageConfirm"))) return;
    const _schemasList = cloneDeep$1(schemasList);
    _schemasList.splice(pageCursor, 1);
    updatePage(_schemasList, Math.max(0, pageCursor - 1));
  };`;

const previousPatchedVitePageRemoveMarkerSnippet = `  const handleRemovePage = () => {
    // pdfme-server patch: allow removing any page when more than two pages remain.
    if (schemasList.length <= 1) return;
    if (!window.confirm(i18n2("removePageConfirm"))) return;
    const _schemasList = cloneDeep$1(schemasList);
    _schemasList.splice(pageCursor, 1);
    updatePage(_schemasList, Math.max(0, pageCursor - 1));
  };`;

const previousUnmarkedVitePageRemoveSnippet = `  const handleRemovePage = () => {
    if (schemasList.length <= 2) return;
    if (!window.confirm(i18n2("removePageConfirm"))) return;
    const _schemasList = cloneDeep$1(schemasList);
    _schemasList.splice(pageCursor, 1);
    updatePage(_schemasList, Math.max(0, pageCursor - 1));
  };`;

const patchedVitePageRemoveSnippet = `  const handleRemovePage = () => {
    // ${pageRemovePatchMarker}.
    if (schemasList.length <= 1) return;
    if (!window.confirm(i18n2("removePageConfirm"))) return;
    const _schemasList = cloneDeep$1(schemasList);
    _schemasList.splice(pageCursor, 1);
    updatePage(_schemasList, Math.max(0, pageCursor - 1));
  };`;

if (!existsSync(packageJsonPath) || !existsSync(distPath)) {
  console.warn('[patch-pdfme-ui] @pdfme/ui is not installed; skipping patch.');
  process.exit(0);
}

function readPackageJson(packageName) {
  const packagePath = resolve(frontendRoot, `node_modules/${packageName}/package.json`);
  if (!existsSync(packagePath)) return null;
  return JSON.parse(readFileSync(packagePath, 'utf8'));
}

function validatePdfmeRuntimeInjectors() {
  for (const injector of pdfmeRuntimeInjectors) {
    const packageJson = readPackageJson(injector.packageName);

    if (!packageJson) {
      if (injector.optional) {
        console.log(`[patch-pdfme-ui] Optional ${injector.packageName} not installed; skipping.`);
        continue;
      }

      throw new Error(`[patch-pdfme-ui] Missing ${injector.packageName}. Review pdfme runtime dependencies before continuing.`);
    }

    if (injector.expectedVersion && packageJson.version !== injector.expectedVersion) {
      throw new Error(`[patch-pdfme-ui] Expected ${injector.packageName} ${injector.expectedVersion}, found ${packageJson.version}. Review injectors before continuing.`);
    }

    const suffix = injector.patchTarget ? 'patch target' : 'validated';
    console.log(`[patch-pdfme-ui] ${injector.packageName} ${packageJson.version} ${suffix}.`);
  }
}

function patchFile(filePath, originalSnippet, patchedSnippet, outdatedPatchedSnippet, label, required = true) {
  if (!existsSync(filePath)) {
    if (required) throw new Error(`[patch-pdfme-ui] Missing ${label}: ${filePath}`);
    console.log(`[patch-pdfme-ui] ${label} not found; skipping.`);
    return false;
  }

  const source = readFileSync(filePath, 'utf8');
  if (source.includes(patchedSnippet)) {
    console.log(`[patch-pdfme-ui] ${label} already patched.`);
    return false;
  }

  const outdatedSnippets = Array.isArray(outdatedPatchedSnippet)
    ? outdatedPatchedSnippet.filter(Boolean)
    : [outdatedPatchedSnippet].filter(Boolean);
  const outdatedSnippet = outdatedSnippets.find((snippet) => source.includes(snippet));
  if (outdatedSnippet) {
    writeFileSync(filePath, source.replace(outdatedSnippet, patchedSnippet));
    console.log(`[patch-pdfme-ui] Updated ${label} patch.`);
    return true;
  }

  if (!source.includes(originalSnippet)) {
    if (!required) {
      console.log(`[patch-pdfme-ui] Could not find expected snippet in ${label}; skipping optional patch.`);
      return false;
    }
    throw new Error(`[patch-pdfme-ui] Could not find the expected snippet in ${label}. The upstream file may have changed.`);
  }

  writeFileSync(filePath, source.replace(originalSnippet, patchedSnippet));
  console.log(`[patch-pdfme-ui] Applied ${label}.`);
  return true;
}

function updateViteMetadata() {
  if (!existsSync(viteMetadataPath) || !existsSync(viteOptimizedPath)) return;

  const metadata = JSON.parse(readFileSync(viteMetadataPath, 'utf8'));
  const optimizedUi = metadata.optimized?.['@pdfme/ui'];
  if (!optimizedUi) return;

  const hash = createHash('sha256').update(readFileSync(viteOptimizedPath)).digest('hex').slice(0, 8);
  optimizedUi.fileHash = hash;
  metadata.browserHash = hash;
  writeFileSync(viteMetadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log('[patch-pdfme-ui] Updated Vite optimized dependency metadata.');
}

validatePdfmeRuntimeInjectors();

patchFile(distPath, originalDistSnippet, patchedDistSnippet, outdatedPatchedDistSnippet, '@pdfme/ui dist paste position');
patchFile(distPath, originalDistCopySnippet, patchedDistCopySnippet, patchedDistCopySnippet, '@pdfme/ui dist copy snapshot');
patchFile(distPath, originalDistClipboardSnippet, patchedDistClipboardSnippet, patchedDistClipboardSnippet, '@pdfme/ui dist paste clipboard');
patchFile(distPath, originalDistListRowSnippet, patchedDistListRowSnippet, patchedDistListRowSnippet, '@pdfme/ui dist sidebar rows');
patchFile(distPath, originalDistSelectoTargetSnippet, patchedDistSelectoTargetSnippet, patchedDistSelectoTargetSnippet, '@pdfme/ui dist locked selecto targets');
patchFile(distPath, originalDistPageMenuSnippet, patchedDistPageMenuSnippet, [previousPatchedDistPageMenuSnippet, previousUnmarkedDistPageMenuSnippet], '@pdfme/ui dist page menu visibility');
patchFile(distPath, originalDistPageInsertSnippet, patchedDistPageInsertSnippet, patchedDistPageInsertSnippet, '@pdfme/ui dist page insert position');
patchFile(distPath, originalDistPageRemoveSnippet, patchedDistPageRemoveSnippet, [previousPatchedDistPageRemoveSnippet, previousPatchedDistPageRemoveMarkerSnippet, previousUnmarkedDistPageRemoveSnippet], '@pdfme/ui dist page remove rule');
const patchedVitePosition = patchFile(viteOptimizedPath, originalViteSnippet, patchedViteSnippet, outdatedPatchedViteSnippet, 'Vite optimized @pdfme/ui paste position', false);
const patchedViteCopy = patchFile(viteOptimizedPath, originalViteCopySnippet, patchedViteCopySnippet, patchedViteCopySnippet, 'Vite optimized @pdfme/ui copy snapshot', false);
const patchedViteClipboard = patchFile(viteOptimizedPath, originalViteClipboardSnippet, patchedViteClipboardSnippet, patchedViteClipboardSnippet, 'Vite optimized @pdfme/ui paste clipboard', false);
const patchedViteListRows = patchFile(viteOptimizedPath, originalViteListRowSnippet, patchedViteListRowSnippet, patchedViteListRowSnippet, 'Vite optimized @pdfme/ui sidebar rows', false);
const patchedViteSelectoTargets = patchFile(viteOptimizedPath, originalViteSelectoTargetSnippet, patchedViteSelectoTargetSnippet, patchedViteSelectoTargetSnippet, 'Vite optimized @pdfme/ui locked selecto targets', false);
const patchedVitePageMenu = patchFile(viteOptimizedPath, originalVitePageMenuSnippet, patchedVitePageMenuSnippet, [previousPatchedVitePageMenuSnippet, previousUnmarkedVitePageMenuSnippet], 'Vite optimized @pdfme/ui page menu visibility', false);
const patchedVitePageInsert = patchFile(viteOptimizedPath, originalVitePageInsertSnippet, patchedVitePageInsertSnippet, patchedVitePageInsertSnippet, 'Vite optimized @pdfme/ui page insert position', false);
const patchedVitePageRemove = patchFile(viteOptimizedPath, originalVitePageRemoveSnippet, patchedVitePageRemoveSnippet, [previousPatchedVitePageRemoveSnippet, previousPatchedVitePageRemoveMarkerSnippet, previousUnmarkedVitePageRemoveSnippet], 'Vite optimized @pdfme/ui page remove rule', false);
const patchedVite = patchedVitePosition || patchedViteCopy || patchedViteClipboard || patchedViteListRows || patchedViteSelectoTargets || patchedVitePageMenu || patchedVitePageInsert || patchedVitePageRemove;
if (patchedVite || existsSync(viteOptimizedPath)) updateViteMetadata();
