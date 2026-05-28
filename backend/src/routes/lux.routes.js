const express = require('express');
const fs = require('fs');
const path = require('path');

const { sendMessageToLux } = require('../services/luxAi.service');

const router = express.Router();
const PENAL_SOURCE_PATH = path.resolve(__dirname, '../../../src/legal_sources/codigo_penal.json');
const LEGAL_FALLBACK_REPLY = 'No tengo información suficiente en la base legal cargada para responder con seguridad.';
const MAX_LEGAL_ARTICLES = 3;
const STOP_WORDS = new Set([
  'sobre',
  'para',
  'como',
  'cual',
  'cuando',
  'donde',
  'quien',
  'que',
  'del',
  'las',
  'los',
  'una',
  'uno',
  'unos',
  'unas',
  'por',
  'con',
  'sin',
  'mas',
  'pero',
  'esta',
  'este',
  'esto',
  'esa',
  'ese',
  'eso',
  'hay',
  'son',
  'ser',
  'fue',
  'fui',
  'penal',
  'codigo',
  'articulo',
  'art',
]);
const LEGAL_INTENT_TERMS = [
  'abuso',
  'amenaza',
  'arma',
  'codigo penal',
  'condena',
  'delito',
  'denuncia',
  'estafa',
  'homicidio',
  'hurto',
  'lesion',
  'pena',
  'penal',
  'prision',
  'robo',
  'violencia',
];

let cachedPenalArticles = null;
let cachedPenalSourceMtime = null;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function tokenize(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function normalizeArticle(rawArticle = {}) {
  const number =
    rawArticle.numero ??
    rawArticle.number ??
    rawArticle.articulo ??
    rawArticle.article ??
    rawArticle.id ??
    null;
  const title =
    rawArticle.titulo ??
    rawArticle.title ??
    rawArticle.epigrafe ??
    rawArticle.heading ??
    '';
  const text =
    rawArticle.texto ??
    rawArticle.text ??
    rawArticle.contenido ??
    rawArticle.content ??
    rawArticle.body ??
    '';

  return {
    ...rawArticle,
    number: number === null || number === undefined ? '' : String(number),
    title: String(title || ''),
    text: String(text || ''),
  };
}

function extractArticlesFromSource(source) {
  if (Array.isArray(source)) {
    return source.map((article) => normalizeArticle(article));
  }

  if (Array.isArray(source?.articulos)) {
    return source.articulos.map((article) => normalizeArticle(article));
  }

  if (Array.isArray(source?.articles)) {
    return source.articles.map((article) => normalizeArticle(article));
  }

  if (source && typeof source === 'object') {
    return Object.entries(source).map(([key, value]) =>
      normalizeArticle(typeof value === 'object' ? { numero: key, ...value } : { numero: key, texto: value })
    );
  }

  return [];
}

function loadPenalArticles() {
  try {
    const stats = fs.statSync(PENAL_SOURCE_PATH);

    if (cachedPenalArticles && cachedPenalSourceMtime === stats.mtimeMs) {
      return cachedPenalArticles;
    }

    const source = JSON.parse(fs.readFileSync(PENAL_SOURCE_PATH, 'utf8'));
    cachedPenalArticles = extractArticlesFromSource(source).filter((article) => article.number || article.text);
    cachedPenalSourceMtime = stats.mtimeMs;
    return cachedPenalArticles;
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.error('[LUX] Error leyendo codigo_penal.json:', error.message);
    }

    cachedPenalArticles = [];
    cachedPenalSourceMtime = null;
    return cachedPenalArticles;
  }
}

function extractRequestedArticleNumbers(message) {
  const normalized = normalizeText(message);
  const explicitMatches = [...normalized.matchAll(/\bart(?:iculo)?\.?\s*(\d+[a-z]*)\b/g)].map((match) => match[1]);

  if (explicitMatches.length) {
    return explicitMatches;
  }

  return [...normalized.matchAll(/\b\d+[a-z]*\b/g)].map((match) => match[0]);
}

function scoreArticle(article, queryTokens, requestedNumbers) {
  const articleNumber = normalizeText(article.number);
  const title = normalizeText(article.title);
  const text = normalizeText(article.text);
  const searchable = `${title} ${text}`;
  let score = 0;

  requestedNumbers.forEach((number) => {
    if (articleNumber === normalizeText(number)) {
      score += 20;
    }
  });

  queryTokens.forEach((token) => {
    if (articleNumber === token) {
      score += 12;
    }

    if (title.includes(token)) {
      score += 5;
    }

    if (text.includes(token)) {
      score += 2;
    }

    if (searchable.includes(token.slice(0, -1)) && token.length > 4) {
      score += 1;
    }
  });

  return score;
}

function findRelatedPenalArticles(message) {
  const articles = loadPenalArticles();
  const queryTokens = tokenize(message);
  const requestedNumbers = extractRequestedArticleNumbers(message);

  if (!articles.length || (!queryTokens.length && !requestedNumbers.length)) {
    return [];
  }

  return articles
    .map((article) => ({
      article,
      score: scoreArticle(article, queryTokens, requestedNumbers),
    }))
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, MAX_LEGAL_ARTICLES)
    .map((item) => item.article);
}

function isPenalQuestion(message) {
  const normalized = normalizeText(message);
  return (
    /\bart(?:iculo)?\.?\s*\d+[a-z]*\b/.test(normalized) ||
    normalized.includes('codigo penal') ||
    normalized.includes('articulo') ||
    LEGAL_INTENT_TERMS.some((term) => normalized.includes(term))
  );
}

function formatLegalContext(articles) {
  return articles
    .map((article) => {
      const title = article.title ? ` - ${article.title}` : '';
      return `Artículo ${article.number}${title}\n${article.text}`;
    })
    .join('\n\n');
}

function buildLegalPrompt(message, articles) {
  return `Sos LUX, asistente jurídico informativo de Luxia.
Respondé la pregunta del usuario usando únicamente los artículos del Código Penal proporcionados como contexto.
No inventes artículos.
No inventes jurisprudencia.
Si el contexto no alcanza, decí que no tenés información suficiente.
Respondé claro, natural y sincero.
Citá los artículos usados.
Aclaración: no reemplaza asesoramiento legal profesional.
No devuelvas el texto crudo completo de los artículos salvo que el usuario lo pida explícitamente.

Pregunta del usuario:
${message}

Contexto legal disponible:
${formatLegalContext(articles)}

Respuesta:`;
}

router.post('/chat', async (req, res) => {
  const { message, context = {} } = req.body || {};

  if (!message) {
    return res.status(400).json({
      success: false,
      error: 'El mensaje es obligatorio.',
    });
  }

  console.log('[LUX] Consulta recibida:', message);

  try {
    const relatedArticles = findRelatedPenalArticles(message);

    if (relatedArticles.length) {
      const reply = await sendMessageToLux(buildLegalPrompt(message, relatedArticles), {
        ...context,
        legalSource: 'codigo_penal',
        relatedArticles: relatedArticles.map((article) => ({
          number: article.number,
          title: article.title,
        })),
      });

      return res.json({
        success: true,
        reply,
      });
    }

    if (isPenalQuestion(message)) {
      return res.json({
        success: true,
        reply: LEGAL_FALLBACK_REPLY,
      });
    }

    const reply = await sendMessageToLux(message, context);

    return res.json({
      success: true,
      reply,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'No pude conectarme con LUX en este momento.',
    });
  }
});

module.exports = router;
