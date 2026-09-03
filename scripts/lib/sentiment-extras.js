/**
 * Sentiment lexicon extensions for Malaysian social content.
 *
 * WHY THIS EXISTS
 * The `sentiment` package scores against AFINN, an English-word lexicon. Our
 * comments are roughly half Malay and heavily emoji-based, so plain AFINN
 * mislabels most of them — measured on a real 36-comment sample it produced
 * 17 positive / 17 neutral / 2 negative where the truth was 33 positive /
 * 11 neutral / 0 negative. Every emoji-only comment and every Malay comment
 * landed in neutral.
 *
 * WHAT THIS DOES AND DOES NOT DO
 * AFINN accepts an `extras` map of token → score (-5..5), so this file teaches
 * it emoji and Malay. That fixes the common cases cheaply and offline.
 *
 * It does NOT replace the Claude pass. A lexicon cannot handle negation
 * ("tak bagus" = not good), sarcasm, or context, so rows stay at
 * BASELINE_CONFIDENCE and Step 2B still reviews them. The lexicon's job is to
 * make the label *usable* before Claude runs, not to be the final word.
 *
 * Scores follow the AFINN convention: -5 (worst) to +5 (best).
 */

/**
 * Emoji carry most of the sentiment in short social comments. AFINN has no
 * emoji at all, so "😍😍😍" scores exactly zero without this.
 * Note the `sentiment` tokeniser splits on whitespace and strips most
 * punctuation, so emoji are matched via the pre-pass in scoreText() rather
 * than relying on tokenisation.
 */
export const EMOJI_SCORES = {
  // strong positive
  '😍': 3, '🥰': 3, '😻': 3, '🤩': 3, '❤️': 3, '❤': 3, '💖': 3, '💕': 3,
  '💗': 3, '💓': 3, '💞': 3, '🩷': 3, '💛': 2, '💚': 2, '💙': 2, '💜': 2,
  '🔥': 3, '🎉': 3, '🎊': 3, '🏆': 3, '🥇': 3, '💯': 3, '⭐': 2, '🌟': 2,
  // approval
  '👏': 2, '👍': 2, '🙌': 2, '✅': 1, '💪': 2, '🤝': 2, '🙏': 1, '✨': 2,
  // mild positive
  '😊': 2, '😁': 2, '😄': 2, '😃': 2, '🙂': 1, '😂': 2, '🤣': 2, '😉': 1,
  '☺️': 2, '😌': 1, '🥳': 3, '😎': 2, '👌': 2, '✌️': 1, '🤗': 2,
  // negative
  '😡': -3, '🤬': -4, '😠': -3, '👎': -3, '💔': -3, '😢': -2, '😭': -2,
  '😞': -2, '😔': -2, '🙄': -2, '😒': -2, '🤦': -2, '😤': -2, '⚠️': -1,
  '❌': -2, '🚫': -2, '😨': -2, '😱': -2, '🤢': -3, '🤮': -4,
}

/**
 * Malay and Malaysian-English (Manglish) terms. Multi-word entries are matched
 * as phrases in scoreText() before tokenisation, so "tak bagus" is caught as
 * negation rather than scoring "bagus" positively.
 */
export const MALAY_SCORES = {
  // positive — praise and congratulation
  tahniah: 3, syabas: 3, terbaik: 4, terbaikk: 4, terbaikko: 4, hebat: 3,
  bagus: 3, cantik: 2, mantap: 3, padu: 3, power: 3, gempak: 3,
  membantu: 2, menarik: 2, seronok: 2, gembira: 2, bangga: 3, hormat: 2,
  jaya: 2, berjaya: 3, kejayaan: 3, cemerlang: 4, sokongan: 2, sokong: 2,
  maju: 2, selamat: 1, sihat: 2, teruskan: 2, semoga: 1,
  'terima kasih': 2, 'tahniah semua': 3, 'syabas semua': 3,
  'sangat membantu': 3, 'sangat bagus': 3, 'sangat baik': 3,
  'bagus sangat': 3, 'baik sangat': 3, 'cepat respon': 2,

  // negative
  teruk: -3, buruk: -3, lambat: -2, lembab: -2, rosak: -3, gagal: -3,
  kecewa: -3, marah: -3, sedih: -2, susah: -2, masalah: -2, salah: -2,
  bodoh: -4, malas: -3, menipu: -4, penipu: -4, tipu: -3, rugi: -2,
  bahaya: -3, kotor: -2, mahal: -2, lambat_sangat: -3,
  'tak bagus': -3, 'tidak bagus': -3, 'tak puas hati': -3,
  'tak berpuas hati': -3, 'tak guna': -4, 'tidak berguna': -3,
  'tak layak': -3, 'sangat teruk': -4, 'tak boleh': -2, 'tidak boleh': -2,
  'tak faham': -1, 'tak jelas': -2,
}

/** Malay function words — enough to tag a row as needing translation. */
const MALAY_MARKERS = /\b(yang|dan|untuk|tidak|tak|sangat|kami|kita|dengan|boleh|akan|sudah|belum|kepada|dalam|pada|ini|itu|saya|awak|mereka|terima kasih|tahniah|semoga|semua)\b/i

export const detectLanguage = (text = '') => (MALAY_MARKERS.test(text) ? 'ms' : 'en')

export const isEmojiOnly = (text = '') =>
  text.trim().length > 0 && !/[a-zA-Z0-9؀-ۿ]/.test(text)

/**
 * Score text with AFINN plus the emoji and Malay lexicons.
 *
 * @param {object} sentimentInstance a `new Sentiment()` from the caller
 * @returns {{score:number,label:string,language:string,matched:string[],needsClaude:boolean}}
 *   `score` is normalised to [-1, 1] on the same /10 scale the other ingest
 *   scripts use, so labels stay comparable across sources.
 */
export const scoreText = (sentimentInstance, text = '') => {
  const raw = (text || '').trim()
  const lower = raw.toLowerCase()
  const matched = []
  let bonus = 0

  // Multi-word Malay phrases first — "tak bagus" must beat "bagus".
  let remaining = lower
  for (const [phrase, value] of Object.entries(MALAY_SCORES)) {
    if (!phrase.includes(' ')) continue
    if (remaining.includes(phrase)) {
      bonus += value
      matched.push(phrase)
      remaining = remaining.split(phrase).join(' ')
    }
  }

  // Emoji are not tokenised reliably, so count occurrences directly.
  for (const [emoji, value] of Object.entries(EMOJI_SCORES)) {
    const count = raw.split(emoji).length - 1
    if (count > 0) {
      // Repetition intensifies, but with diminishing returns — "🔥🔥🔥" is
      // more emphatic than one 🔥, not three times the sentiment.
      bonus += value * Math.min(count, 3) * (count > 1 ? 0.6 : 1)
      matched.push(emoji)
    }
  }

  // Single-word Malay terms go through AFINN's own tokeniser as extras.
  const singleWordExtras = Object.fromEntries(
    Object.entries(MALAY_SCORES).filter(([k]) => !k.includes(' '))
  )
  const afinn = sentimentInstance.analyze(remaining, { extras: singleWordExtras })
  matched.push(...(afinn.positive || []), ...(afinn.negative || []))

  const total = afinn.score + bonus
  const score = Math.max(-1, Math.min(1, total / 10))

  return {
    score,
    label: score > 0.05 ? 'positive' : score < -0.05 ? 'negative' : 'neutral',
    language: isEmojiOnly(raw) ? 'emoji' : detectLanguage(raw),
    matched: [...new Set(matched)],
    // Nothing recognised at all, or non-English text a lexicon can only
    // approximate — either way Claude should look at it.
    needsClaude: matched.length === 0 || detectLanguage(raw) === 'ms',
  }
}
