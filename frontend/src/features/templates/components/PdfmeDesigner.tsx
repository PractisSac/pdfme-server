import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { Template as PdfmeTemplate } from '@pdfme/common';
import { Designer } from '@pdfme/ui';
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

import type { ThemeMode } from '../../../theme/appTheme';
import { loadPdfmeFonts } from './pdfmeFonts';
import { normalizePdfmeTemplateFonts } from './pdfmeTemplateFonts';
import { createPdfmeTheme } from './pdfmeTheme';

export const pdfmePlugins = {
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

type PdfmeDesignerProps = {
  mode: ThemeMode;
  template: PdfmeTemplate;
};

export type PdfmeDesignerHandle = {
  getTemplate: () => PdfmeTemplate | null;
  updateTemplate: (template: PdfmeTemplate) => void;
};

export const PdfmeDesigner = forwardRef<PdfmeDesignerHandle, PdfmeDesignerProps>(function PdfmeDesigner({ mode, template }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const designerRef = useRef<Designer | null>(null);
  const internalTemplateRef = useRef<PdfmeTemplate | null>(null);
  const modeRef = useRef(mode);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useImperativeHandle(ref, () => ({
    getTemplate: () => designerRef.current?.getTemplate() ?? internalTemplateRef.current,
    updateTemplate: (nextTemplate) => {
      const normalizedTemplate = normalizePdfmeTemplateFonts(nextTemplate);
      internalTemplateRef.current = normalizedTemplate;
      designerRef.current?.updateTemplate(normalizedTemplate);
    },
  }), []);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    let isMounted = true;

    loadPdfmeFonts().then((font) => {
      if (!isMounted || !containerRef.current) return;

      const designer = new Designer({
        domContainer: containerRef.current,
        template: normalizePdfmeTemplateFonts(template),
        plugins: pdfmePlugins,
        options: {
          font,
          lang: 'es',
          theme: createPdfmeTheme(modeRef.current),
        },
      });

      designer.onChangeTemplate((nextTemplate) => {
        internalTemplateRef.current = nextTemplate;
      });
      designerRef.current = designer;
    });

    return () => {
      isMounted = false;
      designerRef.current?.destroy();
      designerRef.current = null;
      internalTemplateRef.current = null;
    };
  }, []);

  useEffect(() => {
    designerRef.current?.updateOptions({
      font: designerRef.current.getOptions().font,
      lang: 'es',
      theme: createPdfmeTheme(mode),
    });
  }, [mode]);

  useEffect(() => {
    designerRef.current?.updateTemplate(normalizePdfmeTemplateFonts(template));
  }, [template]);

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return undefined;

    let frameId = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
    });

    observer.observe(containerRef.current);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, []);

  return <div ref={containerRef} className="pdfme-container" />;
});
