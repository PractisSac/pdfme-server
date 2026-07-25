import { Router } from 'express';
import { z } from 'zod';

import { authenticateApiKey } from '../services/api-credentials.service.js';
import { renderTemplatePdf } from '../services/render.service.js';

export const renderRouter = Router();

const renderRequestSchema = z.object({
  templateCode: z.string().min(1),
  input: z.record(z.unknown()).default({}),
  pages: z.array(z.number().int().positive()).default([]),
  ignorePages: z.array(z.number().int().positive()).default([]),
});

renderRouter.post('/v1/render', async (request, response) => {
  const credential = await authenticateApiKey(String(request.header('x-api-key') ?? ''), {
    origin: request.header('origin'),
    ip: request.ip,
  });

  if (!credential) {
    response.status(401).json({ message: 'API key invalida.' });
    return;
  }

  const parsed = renderRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ message: 'Payload invalido para renderizar.' });
    return;
  }

  try {
    const result = await renderTemplatePdf({
      templateCode: parsed.data.templateCode,
      values: parsed.data.input,
      pages: parsed.data.pages,
      ignoredPages: parsed.data.ignorePages,
    });

    if (!result.ok) {
      response.status(result.status).json({
        ok: false,
        message: result.message,
        missingVariables: 'missingVariables' in result ? result.missingVariables : undefined,
        invalidPages: 'invalidPages' in result ? result.invalidPages : undefined,
        invalidIgnoredPages: 'invalidIgnoredPages' in result ? result.invalidIgnoredPages : undefined,
      });
      return;
    }

    const fileName = `${result.template.code}-v${result.template.versionNumber}.pdf`;

    response
      .status(200)
      .setHeader('Content-Type', 'application/pdf')
      .setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
      .setHeader('X-Template-Code', result.template.code)
      .setHeader('X-Template-Version', String(result.template.versionNumber))
      .setHeader('X-Template-Selected-Pages', result.template.selectedPages.join(','))
      .setHeader('X-Template-Rendered-Pages', String(result.template.renderedPageCount))
      .setHeader('X-Template-Ignored-Pages', result.template.ignoredPages.join(','))
      .send(Buffer.from(result.pdf));
  } catch (error) {
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'No se pudo renderizar el PDF.',
    });
  }
});
