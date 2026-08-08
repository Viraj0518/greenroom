import type { Env, WorkersAi } from '../types'

export interface AIReviewInput {
  title: string
  abstract: string | null
  category: string | null
  answers: Record<string, unknown>
  /** rubric_json from the review round: { criteria: [{key,label,description?,max?}] } (free-form tolerated) */
  rubric: Record<string, unknown> | null
}

export interface AIReviewOutput {
  scores: Record<string, number>
  comment: string
}

export interface AIReviewer {
  name: string
  review(input: AIReviewInput): Promise<AIReviewOutput>
}

const DEFAULT_CRITERIA = [
  { key: 'relevance', label: 'Relevance to the event', max: 5 },
  { key: 'clarity', label: 'Clarity of the abstract', max: 5 },
  { key: 'originality', label: 'Originality', max: 5 },
]

function buildPrompt(input: AIReviewInput, criteria: ReturnType<typeof rubricCriteria>): string {
  const criteriaText = criteria.map((c) => `- "${c.key}": ${c.label} (integer 1-${c.max})`).join('\n')
  return [
    'You are reviewing a conference talk submission. Score it against the rubric and give a short, constructive comment for the review committee (2-4 sentences).',
    '',
    `Title: ${input.title}`,
    `Category: ${input.category ?? 'n/a'}`,
    `Abstract:\n${input.abstract ?? '(none provided)'}`,
    '',
    `Rubric criteria:\n${criteriaText}`,
    '',
    'Respond with ONLY a JSON object, no prose around it, shaped exactly like:',
    `{"scores": {${criteria.map((c) => `"${c.key}": <int>`).join(', ')}}, "comment": "<string>"}`,
  ].join('\n')
}

function parseReview(text: string, criteria: ReturnType<typeof rubricCriteria>): AIReviewOutput {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI reviewer returned no JSON object')
  const parsed = JSON.parse(match[0]) as { scores?: Record<string, unknown>; comment?: unknown }
  const scores: Record<string, number> = {}
  for (const c of criteria) {
    const v = Number(parsed.scores?.[c.key])
    scores[c.key] = Number.isFinite(v) ? Math.max(1, Math.min(c.max, Math.round(v))) : 0
  }
  return { scores, comment: typeof parsed.comment === 'string' ? parsed.comment : '' }
}

function rubricCriteria(rubric: Record<string, unknown> | null) {
  const raw = rubric && Array.isArray((rubric as { criteria?: unknown }).criteria)
    ? ((rubric as { criteria: unknown[] }).criteria as Array<Record<string, unknown>>)
    : null
  if (!raw || raw.length === 0) return DEFAULT_CRITERIA
  return raw.map((c, i) => ({
    key: typeof c.key === 'string' ? c.key : `criterion_${i + 1}`,
    label: typeof c.label === 'string' ? c.label : String(c.key ?? `Criterion ${i + 1}`),
    max: typeof c.max === 'number' ? c.max : 5,
  }))
}

export function anthropicReviewer(apiKey: string): AIReviewer {
  return {
    name: 'anthropic',
    async review(input) {
      const criteria = rubricCriteria(input.rubric)
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 1024,
          messages: [{ role: 'user', content: buildPrompt(input, criteria) }],
        }),
      })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Anthropic API error HTTP ${res.status}: ${body.slice(0, 300)}`)
      }
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
      const text = (data.content ?? [])
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n')
      return parseReview(text, criteria)
    },
  }
}

// Pin #8: secretless demo path via the Workers AI binding — no API key required.
export function workersAiReviewer(ai: WorkersAi): AIReviewer {
  return {
    name: 'workers-ai',
    async review(input) {
      const criteria = rubricCriteria(input.rubric)
      // llama-3.1-8b-instruct (base) was deprecated 2026-05-30; 3.3-70b-fp8-fast is the
      // current catalog pick with reliable JSON-following at demo-friendly latency.
      const result = (await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [{ role: 'user', content: buildPrompt(input, criteria) }],
        max_tokens: 800,
      })) as Record<string, unknown>
      // Model families differ: classic binding shape {response}, OpenAI-compat
      // {choices:[{message:{content}}]}, some wrap in {result:{response}}.
      const text =
        (typeof result?.response === 'string' && result.response) ||
        ((result?.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content ?? '') ||
        (typeof (result?.result as { response?: string } | undefined)?.response === 'string'
          ? (result.result as { response: string }).response
          : '')
      if (!text) {
        throw new Error(`Workers AI returned no text (shape: ${JSON.stringify(result).slice(0, 200)})`)
      }
      return parseReview(text, criteria)
    },
  }
}

/**
 * Selection (pin #8): ANTHROPIC_API_KEY → anthropic; else AI binding → workers-ai;
 * else null and the caller 501s ai_not_configured.
 */
export function getAIReviewer(env: Env): AIReviewer | null {
  if (env.ANTHROPIC_API_KEY) return anthropicReviewer(env.ANTHROPIC_API_KEY)
  if (env.AI) return workersAiReviewer(env.AI)
  return null
}
