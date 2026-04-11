/* ============================================================
   SOCRATES — REFLEXIONS-SESSION LOGIK
   Phase 1 (Fragen) · Phase 2 (Dialog) · Abschluss
   ============================================================ */

import {
  getCurrentUser,
  getTodaySession,
  createSession,
  updateSession,
  updateProfile,
  completeSession,
  createInsight,
  getRecentSessions,
} from './supabase.js';
import { DialogSession } from './gemini.js';
import { Orb, calculateNewEnergy } from './orb.js';
import { navigate } from './router.js';

const QUESTIONS = [
  {
    text: 'Wie bist du heute wirklich hier? Körper, Kopf, Energie — ein ehrliches Wort.',
    key: 'state_answer',
  },
  {
    text: 'Was beschäftigt dich heute am stärksten?',
    key: 'topic_answer',
  },
  {
    text: 'Was davon ist die Erscheinung — und was ahnst du dahinter?',
    key: 'shadow_answer',
  },
  {
    text: 'Was möchtest du heute erkennen, klären oder loslassen?',
    key: 'intention_answer',
  },
];

export class ReflectionManager {
  constructor() {
    this.user = null;
    this.profile = null;
    this.session = null;
    this.answers = {};
    this.currentQuestion = 0;
    this.phase = 'questions'; // 'questions' | 'dialog' | 'closing'
    this.dialogSession = null;
    this.orb = null;
    this.startTime = null;
  }

  async init() {
    this.user = await getCurrentUser();
    if (!this.user) {
      navigate('landing');
      return false;
    }

    // Hole oder erstelle heutige Session
    this.session = await getTodaySession(this.user.id);
    if (this.session?.completed) {
      navigate('app');
      return false;
    }
    if (!this.session) {
      this.session = await createSession(this.user.id);
    }

    this.startTime = Date.now();
    return true;
  }

  /* ---- PHASE 1: FRAGEN ---- */

  getQuestion(index) {
    return QUESTIONS[index] || null;
  }

  getTotalQuestions() {
    return QUESTIONS.length;
  }

  async saveAnswer(questionIndex, answer) {
    const q = QUESTIONS[questionIndex];
    if (!q) return;

    this.answers[q.key] = answer;

    await updateSession(this.session.id, {
      [q.key]: answer,
    });
  }

  isLastQuestion() {
    return this.currentQuestion === QUESTIONS.length - 1;
  }

  nextQuestion() {
    if (this.currentQuestion < QUESTIONS.length - 1) {
      this.currentQuestion++;
      return true;
    }
    return false;
  }

  /* ---- PHASE 2: DIALOG ---- */

  async startDialog(previousSessions) {
    this.phase = 'dialog';
    this.dialogSession = new DialogSession(previousSessions);

    const openingReply = await this.dialogSession.openDialog({
      state: this.answers.state_answer || '',
      topic: this.answers.topic_answer || '',
      shadow: this.answers.shadow_answer || '',
      intention: this.answers.intention_answer || '',
    });

    return openingReply;
  }

  async sendUserMessage(text) {
    if (!this.dialogSession) return null;
    const reply = await this.dialogSession.respond(text);

    // Zwischenspeichern
    await updateSession(this.session.id, {
      dialogue_log: this.dialogSession.getLog(),
    });

    return reply;
  }

  isReadyToClose() {
    return this.dialogSession?.exchangeCount >= 5;
  }

  isClosingTriggered() {
    return this.dialogSession?.isClosing || false;
  }

  /* ---- AHA MOMENT ---- */

  async markAhaMoment(content) {
    const insight = await createInsight(
      this.user.id,
      this.session.id,
      content,
      null
    );

    await updateSession(this.session.id, {
      aha_moment: content,
    });

    return insight;
  }

  /* ---- PHASE 3: ABSCHLUSS ---- */

  async finishSession(finalUserResponse) {
    this.phase = 'closing';

    const closing = await this.dialogSession.generateClosing(finalUserResponse);
    const durationSeconds = Math.floor((Date.now() - this.startTime) / 1000);

    // Session abschließen
    const updatedSession = await completeSession(this.session.id, {
      closing_insight: closing.closing_insight,
      exercise_tomorrow: closing.exercise_tomorrow,
      dialogue_log: this.dialogSession.getLog(),
      completed: true,
      duration_seconds: durationSeconds,
    });

    // Erkenntnis speichern
    if (closing.closing_insight) {
      await createInsight(
        this.user.id,
        this.session.id,
        closing.closing_insight,
        closing.form_recognized
      );
    }

    // Profil updaten — Streak, Orb-Energie
    await this._updateProfileAfterSession();

    // Muster-Analyse triggern (alle 5 Sessions)
    await this._triggerPatternAnalysis();

    return closing;
  }

  async _updateProfileAfterSession() {
    const today = new Date().toISOString().split('T')[0];

    // Aktuelles Profil holen um Streak zu berechnen
    const { getProfile } = await import('./supabase.js');
    const profile = await getProfile(this.user.id);

    const lastDate = profile?.last_session_date;
    let streak = profile?.streak_count || 0;

    if (lastDate) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];

      if (lastDate === yStr || lastDate === today) {
        streak = streak + 1;
      } else {
        streak = 1; // Streak gebrochen
      }
    } else {
      streak = 1;
    }

    const currentEnergy = parseFloat(profile?.orb_energy) || 1.0;
    const newEnergy = calculateNewEnergy(currentEnergy, 'session_complete');

    await updateProfile(this.user.id, {
      last_session_date: today,
      streak_count: streak,
      orb_energy: newEnergy,
      total_sessions: (profile?.total_sessions || 0) + 1,
    });

    return { streak, newEnergy };
  }

  async _triggerPatternAnalysis() {
    const { getProfile } = await import('./supabase.js');
    const profile = await getProfile(this.user.id);
    const totalSessions = profile?.total_sessions || 0;

    // Alle 5 Sessions
    if (totalSessions > 0 && totalSessions % 5 === 0) {
      const sessions = await getRecentSessions(this.user.id, 10);
      if (sessions.length >= 3) {
        // Trigger Netlify Function
        fetch('/.netlify/functions/insights-engine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: this.user.id,
            sessions,
          }),
        }).catch(() => {});
      }
    }
  }
}

/* ---- RECENT SESSIONS LOADER ---- */
export async function loadRecentSessions(userId) {
  return getRecentSessions(userId, 5);
}
