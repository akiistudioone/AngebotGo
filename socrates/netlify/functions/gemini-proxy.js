/* ============================================================
   SOCRATES — GEMINI PROXY (Netlify Function)
   Endpoint: /.netlify/functions/gemini-proxy
   Methode:  POST
   Body:     { messages: [...], systemPrompt: "..." }
   ============================================================ */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const ALLOWED_ORIGINS = [
  'https://socrates.netlify.app',
  'http://localhost:8888',
  'http://localhost:3000',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

exports.handler = async (event, context) => {
  const origin = event.headers.origin || '';

  // CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(origin),
      body: '',
    };
  }

  // Nur POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders(origin),
      body: JSON.stringify({ error: 'Methode nicht erlaubt.' }),
    };
  }

  // API Key prüfen
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: corsHeaders(origin),
      body: JSON.stringify({ error: 'API-Konfiguration fehlt.' }),
    };
  }

  let messages, systemPrompt;
  try {
    const body = JSON.parse(event.body || '{}');
    messages = body.messages;
    systemPrompt = body.systemPrompt;

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('messages muss ein nicht-leeres Array sein.');
    }
    if (typeof systemPrompt !== 'string' || !systemPrompt.trim()) {
      throw new Error('systemPrompt muss ein nicht-leerer String sein.');
    }
  } catch (err) {
    return {
      statusCode: 400,
      headers: corsHeaders(origin),
      body: JSON.stringify({ error: `Ungültiger Request: ${err.message}` }),
    };
  }

  // Nachrichten validieren/sanitizen
  const safeMessages = messages
    .filter(m => m && typeof m.role === 'string' && Array.isArray(m.parts))
    .slice(-30); // Max 30 Nachrichten im Kontext

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: systemPrompt,
    });

    // History = alle bis auf die letzte Nachricht
    const history = safeMessages.slice(0, -1);
    const lastMessage = safeMessages[safeMessages.length - 1];
    const lastText = lastMessage?.parts?.[0]?.text || '';

    const chat = model.startChat({
      history: history.map(m => ({
        role: m.role,
        parts: m.parts,
      })),
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.8,
      },
    });

    const result = await chat.sendMessage(lastText);
    const responseText = result.response.text();

    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: JSON.stringify({ response: responseText }),
    };

  } catch (err) {
    const status = err.status || 500;
    const message = err.message || 'Gemini-Fehler.';

    return {
      statusCode: status >= 400 && status < 600 ? status : 500,
      headers: corsHeaders(origin),
      body: JSON.stringify({ error: message }),
    };
  }
};
