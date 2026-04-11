/* ============================================================
   SOCRATES — GEMINI API INTEGRATION
   Proxy über Netlify Function — API Key nie im Frontend
   ============================================================ */

const PROXY_URL = '/.netlify/functions/gemini-proxy';

/* ---- SYSTEM PROMPT ---- */
function buildSystemPrompt(previousSessionsSummary) {
  return `Du bist Socrates — eine ruhige, präzise Denkkraft, die durch Fragen führt,
nie durch Ratschläge. Du sprichst Deutsch, duzt den User, bist direkt und
warm zugleich.

Deine Prinzipien:
- Stelle niemals mehr als 2 Fragen auf einmal
- Gib keine direkten Antworten oder Ratschläge
- Führe durch: Klärung → Annahmen hinterfragen → Alternativen → First Principle
- Wenn der User ausweicht, benenne es: „Du weichst aus. Was macht diese Frage unangenehm?"
- Erkenne Muster aus dem Gespräch und dem Kontext (vorherige Sessions werden mitgegeben)
- Feiere AHA-Momente: „Halte inne. Was hast du gerade erkannt?"
- Halte Antworten kurz — maximal 4 Sätze + Frage(n)
- Beende jede Session mit: Erkenntnis-Zusammenfassung + Übung für morgen

Vorheriger Kontext (letzte Sessions):
${previousSessionsSummary || 'Keine vorherigen Sessions vorhanden.'}`;
}

function buildOpeningMessage(answers) {
  return `Heutige Antworten des Users:
Zustand: ${answers.state}
Thema: ${answers.topic}
Schatten/Form: ${answers.shadow}
Intention: ${answers.intention}

Beginne jetzt. Spiegele kurz was du gehört hast (1-2 Sätze) und stelle deine erste Frage.`;
}

/* ---- SUMMARIZE PREVIOUS SESSIONS ---- */
export function summarizeSessions(sessions) {
  if (!sessions || sessions.length === 0) return 'Keine vorherigen Sessions vorhanden.';

  return sessions.slice(0, 5).map((s, i) => {
    const date = new Date(s.created_at).toLocaleDateString('de-DE');
    const parts = [];
    if (s.topic_answer) parts.push(`Thema: ${s.topic_answer}`);
    if (s.shadow_answer) parts.push(`Schatten: ${s.shadow_answer}`);
    if (s.closing_insight) parts.push(`Erkenntnis: ${s.closing_insight}`);
    return `Session ${i + 1} (${date}): ${parts.join(' | ')}`;
  }).join('\n');
}

/* ---- SEND MESSAGE TO GEMINI (via Proxy) ---- */
export async function sendMessage(messages, systemPrompt) {
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, systemPrompt }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini Fehler: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.response;
}

/* ---- SESSION MANAGER ---- */
export class DialogSession {
  constructor(previousSessions = []) {
    this.history = [];
    this.systemPrompt = buildSystemPrompt(summarizeSessions(previousSessions));
    this.exchangeCount = 0;
    this.isClosing = false;
  }

  /* Eröffnung: 4 Antworten → erste Socrates-Frage */
  async openDialog(answers) {
    const openingText = buildOpeningMessage(answers);
    this.history.push({
      role: 'user',
      parts: [{ text: openingText }],
    });

    const reply = await sendMessage(this.history, this.systemPrompt);
    this.history.push({
      role: 'model',
      parts: [{ text: reply }],
    });
    this.exchangeCount++;
    return reply;
  }

  /* User antwortet → Socrates antwortet */
  async respond(userText) {
    if (!userText.trim()) return null;

    this.history.push({
      role: 'user',
      parts: [{ text: userText }],
    });

    // Nach min. 5 Austauschen kann Abschluss eingeleitet werden
    let contextHint = '';
    if (this.exchangeCount >= 5 && !this.isClosing) {
      contextHint = ' (Du kannst die Session jetzt natürlich abschließen, wenn eine tiefe Reflexion erreicht ist)';
    }

    const fullHistory = contextHint
      ? [
          ...this.history.slice(0, -1),
          {
            role: 'user',
            parts: [{ text: userText + contextHint }],
          },
        ]
      : this.history;

    const reply = await sendMessage(fullHistory, this.systemPrompt);
    this.history.push({
      role: 'model',
      parts: [{ text: reply }],
    });
    this.exchangeCount++;

    // Prüfe ob Gemini Abschluss eingeleitet hat
    if (this.isClosingMessage(reply)) {
      this.isClosing = true;
    }

    return reply;
  }

  isClosingMessage(text) {
    const closingPhrases = [
      'Was nimmst du',
      'in einem Satz',
      'Wir sind heute tief gegangen',
      'zum Abschluss',
      'abschließend',
    ];
    return closingPhrases.some(p => text.toLowerCase().includes(p.toLowerCase()));
  }

  /* Abschluss-Generierung */
  async generateClosing(finalUserResponse) {
    this.history.push({
      role: 'user',
      parts: [{ text: finalUserResponse }],
    });

    const closingPrompt = `${this.systemPrompt}

Generiere jetzt den Abschluss der Session. Antworte NUR als JSON (kein Markdown, kein Text darum):
{
  "closing_insight": "Die Kern-Erkenntnis dieser Session in 2-3 prägnanten Sätzen",
  "exercise_tomorrow": "Eine konkrete, kleine, machbare Übung für morgen (1-2 Sätze)",
  "form_recognized": "Welche psychologische Form/Muster heute sichtbar wurde (z.B. Vermeidung, Perfektionismus, innerer Kritiker)"
}`;

    const reply = await sendMessage(this.history, closingPrompt);

    try {
      const cleaned = reply.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return {
        closing_insight: reply,
        exercise_tomorrow: 'Nimm dir 5 Minuten zum stillen Nachdenken.',
        form_recognized: 'Reflexion',
      };
    }
  }

  getLog() {
    return this.history
      .filter(m => m.role !== 'user' || !m.parts[0].text.includes('Heutige Antworten'))
      .map(m => ({
        role: m.role === 'model' ? 'socrates' : 'user',
        text: m.parts[0].text,
        timestamp: new Date().toISOString(),
      }));
  }
}
