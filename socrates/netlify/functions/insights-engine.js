/* ============================================================
   SOCRATES — INSIGHTS ENGINE (Netlify Function)
   Endpoint: /.netlify/functions/insights-engine
   Methode:  POST
   Body:     { userId: "...", sessions: [...] }

   Analysiert die letzten Sessions mit Gemini und speichert
   erkannte Muster in der Supabase-Datenbank.
   ============================================================ */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Konfiguration unvollständig.' }),
    };
  }

  let userId, sessions;
  try {
    const body = JSON.parse(event.body || '{}');
    userId = body.userId;
    sessions = body.sessions;

    if (!userId || !Array.isArray(sessions) || sessions.length < 3) {
      throw new Error('userId und mind. 3 Sessions erforderlich.');
    }
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: err.message }),
    };
  }

  // Session-Daten für Gemini aufbereiten
  const sessionSummaries = sessions.map((s, i) => {
    const date = new Date(s.created_at).toLocaleDateString('de-DE');
    const parts = [];
    if (s.state_answer)    parts.push(`Zustand: "${s.state_answer}"`);
    if (s.topic_answer)    parts.push(`Thema: "${s.topic_answer}"`);
    if (s.shadow_answer)   parts.push(`Schatten: "${s.shadow_answer}"`);
    if (s.intention_answer) parts.push(`Intention: "${s.intention_answer}"`);
    if (s.closing_insight) parts.push(`Erkenntnis: "${s.closing_insight}"`);
    if (s.aha_moment)      parts.push(`AHA: "${s.aha_moment}"`);
    return `Session ${i + 1} (${date}):\n${parts.join('\n')}`;
  }).join('\n\n---\n\n');

  const prompt = `Analysiere diese ${sessions.length} Reflexions-Sessions eines Users.
Erkenne wiederkehrende Muster in seinen Themen, Schatten, Ausweichbewegungen und Erkenntnissen.

${sessionSummaries}

Antworte NUR als JSON (kein Markdown, kein erklärender Text davor oder danach):
{
  "patterns": [
    {
      "type": "Bezeichnung des Musters (z.B. Vermeidung, Perfektionismus, innerer Kritiker)",
      "description": "Kurze Beschreibung in 2-3 Sätzen, direkt an den User gerichtet",
      "evidence": "Konkrete Belege aus den Sessions (1-2 Sätze)",
      "frequency": "wie oft und in welchem Zusammenhang gesehen"
    }
  ]
}

Erkenne 1-3 Muster. Nur echte, belegbare Muster — keine Vermutungen.`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.4,
      },
    });

    const result = await model.generateContent(prompt);
    const raw = result.response.text();

    let parsed;
    try {
      const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Ungültige Gemini-Antwort.', raw }),
      };
    }

    if (!Array.isArray(parsed.patterns) || parsed.patterns.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Keine Muster erkannt.', patterns: [] }),
      };
    }

    // Supabase: Muster speichern
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const sessionIds = sessions.map(s => s.id);

    const inserts = parsed.patterns.map(p => ({
      user_id: userId,
      pattern_type: p.type || 'Unbekannt',
      description: p.description || '',
      session_ids: sessionIds,
      times_seen: 1,
      acknowledged: false,
    }));

    // Prüfen ob ähnliches Muster bereits existiert, dann times_seen erhöhen
    for (const insert of inserts) {
      const { data: existing } = await supabase
        .from('patterns')
        .select('id, times_seen')
        .eq('user_id', userId)
        .eq('pattern_type', insert.pattern_type)
        .single();

      if (existing) {
        await supabase
          .from('patterns')
          .update({
            times_seen: existing.times_seen + 1,
            description: insert.description,
            session_ids: sessionIds,
            acknowledged: false,
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('patterns').insert(insert);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `${parsed.patterns.length} Muster erkannt und gespeichert.`,
        patterns: parsed.patterns,
      }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
