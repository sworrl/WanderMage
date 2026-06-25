import { useEffect, useState } from 'react'
import { ratings as ratingsApi } from '../services/api'

interface Dim { key: string; label: string }
interface Review {
  id: number
  username?: string
  overall: number
  dimensions?: Record<string, number>
  comment?: string
  origin: string
}
interface Summary {
  poi_serial: string
  count: number
  overall_avg?: number
  dimension_avgs: Record<string, number>
  dimensions: Dim[]
  reviews: Review[]
}

// Bespoke 1-5 rating control: five segments, no icons. Fills with the theme accent.
function Bars({ value, onChange, readOnly }: { value: number; onChange?: (v: number) => void; readOnly?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          aria-label={`${n} of 5`}
          style={{
            width: 15,
            height: 15,
            padding: 0,
            borderRadius: 3,
            cursor: readOnly ? 'default' : 'pointer',
            border: '1px solid var(--border-color)',
            background: n <= Math.round(value) ? 'var(--accent-primary)' : 'transparent',
          }}
        />
      ))}
    </span>
  )
}

export default function RatingWidget({ poiSerial, category }: { poiSerial?: string; category?: string }) {
  const serial = poiSerial || ''
  const [dimensions, setDimensions] = useState<Dim[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [open, setOpen] = useState(false)
  const [overall, setOverall] = useState(0)
  const [scores, setScores] = useState<Record<string, number>>({})
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  const loadSummary = () => {
    if (!serial) return
    ratingsApi.summary(serial).then((r) => setSummary(r.data)).catch(() => {})
  }

  useEffect(() => {
    if (category) ratingsApi.dimensions(category).then((r) => setDimensions(r.data.dimensions)).catch(() => {})
    loadSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serial, category])

  const submit = async () => {
    if (!overall || !serial) return
    setBusy(true)
    try {
      await ratingsApi.create({ poi_serial: serial, category, overall, dimensions: scores, comment })
      setOpen(false)
      setOverall(0)
      setScores({})
      setComment('')
      loadSummary()
    } catch {
      /* submitting requires sign-in */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {summary && summary.count > 0 ? `RV rating ${summary.overall_avg} (${summary.count})` : 'No RV ratings yet'}
        </span>
        <button type="button" onClick={() => setOpen((o) => !o)} style={{ fontSize: 12 }}>
          {open ? 'Cancel' : 'Rate it'}
        </button>
      </div>

      {summary && Object.keys(summary.dimension_avgs).length > 0 && !open && (
        <div style={{ marginTop: 6 }}>
          {dimensions
            .filter((d) => summary.dimension_avgs[d.key])
            .map((d) => (
              <div key={d.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, margin: '2px 0' }}>
                <span style={{ color: 'var(--text-tertiary)' }}>{d.label}</span>
                <Bars value={summary.dimension_avgs[d.key]} readOnly />
              </div>
            ))}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '4px 0' }}>
            <strong>Overall</strong>
            <Bars value={overall} onChange={setOverall} />
          </div>
          {dimensions.map((d) => (
            <div key={d.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '3px 0' }}>
              <span>{d.label}</span>
              <Bars value={scores[d.key] || 0} onChange={(v) => setScores((s) => ({ ...s, [d.key]: v }))} />
            </div>
          ))}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Notes for fellow travelers (tight hookup? low canopy? hard to pull out?)"
            style={{ width: '100%', marginTop: 6, fontSize: 12, minHeight: 48 }}
          />
          <button type="button" onClick={submit} disabled={busy || !overall} style={{ marginTop: 6, fontSize: 12 }}>
            {busy ? 'Saving…' : 'Submit rating'}
          </button>
        </div>
      )}

      {summary && summary.reviews.length > 0 && !open && (
        <div style={{ marginTop: 8, maxHeight: 120, overflowY: 'auto' }}>
          {summary.reviews.slice(0, 5).map((r, i) => (
            <div key={i} style={{ fontSize: 11, margin: '5px 0', color: 'var(--text-secondary)' }}>
              <Bars value={r.overall} readOnly /> <span>{r.username || 'traveler'}</span>
              {r.origin !== 'local' && <span style={{ color: 'var(--text-muted)' }}> · network</span>}
              {r.comment && <div style={{ color: 'var(--text-tertiary)', marginTop: 2 }}>{r.comment}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
