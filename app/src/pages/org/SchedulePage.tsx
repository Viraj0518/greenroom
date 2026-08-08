import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { api } from '../../api'
import { useOrg } from './OrgLayout'
import type { Conflict, Room, ScheduleSlot, Submission, Track } from '../../types'
import { dayKey, dayRange, fmtDate, fmtTime, tzMinutesOfDay, zonedToUtc } from '../../lib'
import { Badge, Button, Card, Select, Spinner, Tabs, useToast } from '../../components/ui'
import '../../styles/schedule.css'

const DAY_START = 8 * 60   // 08:00 event-local
const DAY_END = 19 * 60    // 19:00
const PX_PER_MIN = 1.2
const CELL_MIN = 15        // drop granularity
const DEFAULT_TALK_MIN = 30

type View = 'list' | 'day' | 'week' | 'track' | 'room'

interface DragData {
  kind: 'sub' | 'slot'
  submission?: Submission
  slot?: ScheduleSlot
}

export function SchedulePage() {
  const { event } = useOrg()
  const toast = useToast()
  const [rooms, setRooms] = useState<Room[] | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [subs, setSubs] = useState<Submission[]>([])
  const [view, setView] = useState<View>('day')
  const [day, setDay] = useState('')
  const [roomId, setRoomId] = useState('')
  const [dragging, setDragging] = useState<DragData | null>(null)

  const days = useMemo(() => dayRange(event.starts_on, event.ends_on), [event])
  const tz = event.timezone

  useEffect(() => {
    Promise.all([
      api.listRooms(event.id),
      api.listTracks(event.id),
      api.schedule(event.id),
      api.listSubmissions(event.id, { status: 'accepted' }),
    ]).then(([rm, tr, sch, sb]) => {
      setRooms(rm.slice().sort((a, b) => a.sort - b.sort))
      setTracks(tr)
      setSlots(sch.slots)
      setConflicts(sch.conflicts)
      setSubs(sb)
      setDay((d) => d || (days[0] ?? ''))
      setRoomId((r) => r || (rm[0]?.id ?? ''))
    })
  }, [event.id, days])

  const trackById = useCallback((id: string | null) => tracks.find((t) => t.id === id), [tracks])
  const trackByName = useCallback((name: string | null) => tracks.find((t) => t.name === name), [tracks])
  const subById = useCallback((id: string | null) => subs.find((s) => s.id === id), [subs])
  const titleOf = useCallback(
    (s: ScheduleSlot) => s.title ?? s.submission_title ?? subById(s.submission_id)?.title ?? 'Untitled',
    [subById],
  )

  const scheduledSubIds = useMemo(() => new Set(slots.map((s) => s.submission_id).filter(Boolean)), [slots])
  const tray = subs.filter((s) => !scheduledSubIds.has(s.id))
  const conflictSlotIds = useMemo(() => new Set(conflicts.flatMap((c) => c.slotIds)), [conflicts])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  async function onDragEnd(e: DragEndEvent) {
    setDragging(null)
    const data = e.active.data.current as DragData | undefined
    const overId = e.over?.id as string | undefined
    if (!data || !overId) return
    const [dropRoomId, minStr] = overId.split('|')
    const startMin = Number(minStr)

    // slot mutations return the fresh full {slots, conflicts} — replace wholesale
    try {
      if (data.kind === 'sub' && data.submission) {
        const res = await api.createSlot(event.id, {
          submission_id: data.submission.id, room_id: dropRoomId,
          starts_at: zonedToUtc(day, startMin, tz),
          ends_at: zonedToUtc(day, startMin + DEFAULT_TALK_MIN, tz),
          kind: 'talk',
        })
        setSlots(res.slots)
        setConflicts(res.conflicts)
      } else if (data.kind === 'slot' && data.slot) {
        const dur = (new Date(data.slot.ends_at).getTime() - new Date(data.slot.starts_at).getTime()) / 60000
        const res = await api.updateSlot(data.slot.id, {
          room_id: dropRoomId,
          starts_at: zonedToUtc(day, startMin, tz),
          ends_at: zonedToUtc(day, startMin + dur, tz),
        })
        setSlots(res.slots)
        setConflicts(res.conflicts)
      }
    } catch {
      toast('Could not save the change — try again', { error: true })
    }
  }

  async function removeSlot(slot: ScheduleSlot) {
    setSlots((sl) => sl.filter((x) => x.id !== slot.id))
    try {
      const res = await api.deleteSlot(slot.id)
      setSlots(res.slots)
      setConflicts(res.conflicts)
      toast('Removed from schedule')
    } catch {
      setSlots((sl) => [...sl, slot])
      toast('Could not remove the slot', { error: true })
    }
  }

  if (!rooms) return <Spinner label="Loading schedule…" />

  const daySlots = slots.filter((s) => dayKey(s.starts_at, tz) === day)
  const blockProps = { tz, conflictIds: conflictSlotIds, trackById, titleOf }

  return (
    <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setDragging(e.active.data.current as DragData)}
      onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="page-title">
        <h1>Schedule</h1>
        <div className="row-wrap small muted">
          {tracks.map((t) => (
            <span key={t.id} className="row" style={{ gap: 5 }}>
              <span className="dot" style={{ background: t.color }} />{t.name}
            </span>
          ))}
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="conflict-banner" role="alert">
          <strong>⚠ {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''}</strong>
          <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }} className="stack">
            {conflicts.map((c, i) => (
              <li key={i} className="spread" style={{ gap: 10 }}>
                <span>{c.reason}</span>
                <Button size="sm" onClick={() => {
                  const sl = slots.find((x) => c.slotIds.includes(x.id))
                  if (sl) { setView('day'); setDay(dayKey(sl.starts_at, tz)) }
                }}>Show</Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="row-wrap" style={{ marginBottom: 12 }}>
        <Tabs value={view} onChange={setView} tabs={[
          { key: 'list', label: 'List' },
          { key: 'day', label: 'Day' },
          { key: 'week', label: 'Week' },
          { key: 'track', label: 'By track' },
          { key: 'room', label: 'By room' },
        ]} />
        <span className="grow" />
        {(view === 'day' || view === 'track') && (
          <Select value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day" style={{ width: 190 }}>
            {days.map((d) => (
              <option key={d} value={d}>{fmtDate(`${d}T12:00:00Z`, { weekday: 'short', month: 'short', day: 'numeric' })}</option>
            ))}
          </Select>
        )}
        {view === 'room' && (
          <Select value={roomId} onChange={(e) => setRoomId(e.target.value)} aria-label="Room" style={{ width: 190 }}>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        )}
        {view !== 'day' && <span className="faint small">read-only — drag &amp; drop lives in Day view</span>}
      </div>

      {view === 'day' && (
        <div className="sched-layout">
          <Card title={`Unscheduled (${tray.length})`} pad={false}>
            <div className="sched-tray-list">
              {tray.length === 0 && <p className="muted small" style={{ padding: 10 }}>All accepted talks are scheduled 🎉</p>}
              {tray.map((s) => <TrayChip key={s.id} sub={s} color={trackByName(s.track)?.color} />)}
            </div>
          </Card>
          <Card pad={false}>
            <div className="sched-grid-wrap">
              <TimeGrid
                columns={rooms.map((r) => ({
                  key: r.id, label: r.name,
                  sub: r.capacity != null ? `${r.capacity} seats` : undefined,
                  slots: daySlots.filter((s) => s.room_id === r.id),
                }))}
                droppable={dragging ? 'room' : undefined}
                onRemove={removeSlot}
                {...blockProps}
              />
            </div>
          </Card>
        </div>
      )}

      {view === 'week' && (
        <Card pad={false}>
          <div className="sched-grid-wrap">
            <TimeGrid
              columns={days.map((d) => ({
                key: d,
                label: fmtDate(`${d}T12:00:00Z`, { weekday: 'short', month: 'short', day: 'numeric' }),
                slots: slots.filter((s) => dayKey(s.starts_at, tz) === d),
              }))}
              {...blockProps}
            />
          </div>
        </Card>
      )}

      {view === 'track' && (
        <Card pad={false}>
          <div className="sched-grid-wrap">
            <TimeGrid
              columns={tracks.map((t) => ({
                key: t.id, label: t.name,
                slots: daySlots.filter((s) => s.track_id === t.id),
              })).concat([{ key: '_none', label: 'No track', slots: daySlots.filter((s) => !s.track_id) }])}
              {...blockProps}
            />
          </div>
        </Card>
      )}

      {view === 'room' && (
        <Card pad={false}>
          <div className="sched-grid-wrap">
            <TimeGrid
              columns={days.map((d) => ({
                key: d,
                label: fmtDate(`${d}T12:00:00Z`, { weekday: 'short', month: 'short', day: 'numeric' }),
                slots: slots.filter((s) => s.room_id === roomId && dayKey(s.starts_at, tz) === d),
              }))}
              {...blockProps}
            />
          </div>
        </Card>
      )}

      {view === 'list' && (
        <ListView slots={slots} days={days} rooms={rooms} {...blockProps} />
      )}

      <DragOverlay dropAnimation={null}>
        {dragging?.kind === 'sub' && dragging.submission && (
          <div className="sched-chip" style={{ ['--track' as string]: trackByName(dragging.submission.track)?.color }}>
            <strong>{dragging.submission.title}</strong>
          </div>
        )}
        {dragging?.kind === 'slot' && dragging.slot && (
          <div className="sched-chip" style={{ ['--track' as string]: trackById(dragging.slot.track_id)?.color }}>
            <strong>{titleOf(dragging.slot)}</strong>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

function TrayChip({ sub, color }: { sub: Submission; color?: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tray-${sub.id}`, data: { kind: 'sub', submission: sub } satisfies DragData,
  })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className="sched-chip"
      style={{ ['--track' as string]: color, opacity: isDragging ? 0.4 : 1 }}>
      <strong>{sub.title}</strong>
      <div className="who">{sub.speaker_name}{sub.track ? ` · ${sub.track}` : ''}</div>
    </div>
  )
}

interface GridColumn { key: string; label: string; sub?: string; slots: ScheduleSlot[] }
interface BlockProps {
  tz: string
  conflictIds: Set<string>
  trackById: (id: string | null) => Track | undefined
  titleOf: (s: ScheduleSlot) => string
}

/** Time × columns grid. Pass `droppable`+`onRemove` to enable dnd (Day view). */
function TimeGrid({ columns, droppable, onRemove, tz, conflictIds, trackById, titleOf }: {
  columns: GridColumn[]
  droppable?: 'room'
  onRemove?: (s: ScheduleSlot) => void
} & BlockProps) {
  const height = (DAY_END - DAY_START) * PX_PER_MIN
  const hours: number[] = []
  for (let m = DAY_START; m <= DAY_END; m += 60) hours.push(m)

  return (
    <div className="sched-grid" style={{ gridTemplateColumns: `52px repeat(${columns.length}, minmax(150px, 1fr))` }}>
      <div className="sched-head" aria-hidden />
      {columns.map((c) => (
        <div key={c.key} className="sched-head">
          {c.label}
          {c.sub && <div className="faint small" style={{ fontWeight: 500 }}>{c.sub}</div>}
        </div>
      ))}

      <div className="sched-timecol" style={{ height }}>
        {hours.map((m) => (
          <span key={m} className="sched-time" style={{ top: (m - DAY_START) * PX_PER_MIN }}>
            {String(Math.floor(m / 60)).padStart(2, '0')}:00
          </span>
        ))}
      </div>

      {columns.map((c) => (
        <div key={c.key} className="sched-col" style={{ height }}>
          {hours.map((m) => (
            <div key={m} className="sched-hourline" style={{ top: (m - DAY_START) * PX_PER_MIN }} aria-hidden />
          ))}
          {droppable && Array.from({ length: (DAY_END - DAY_START) / CELL_MIN }, (_, i) => (
            <DropCell key={i} colKey={c.key} min={DAY_START + i * CELL_MIN} />
          ))}
          {c.slots.map((s) => {
            const start = tzMinutesOfDay(s.starts_at, tz)
            const end = tzMinutesOfDay(s.ends_at, tz)
            return (
              <SlotBlock key={s.id} slot={s} top={(start - DAY_START) * PX_PER_MIN}
                height={Math.max((end - start) * PX_PER_MIN, 22)}
                color={s.track_color ?? trackById(s.track_id)?.color}
                conflict={conflictIds.has(s.id)}
                title={titleOf(s)}
                time={`${fmtTime(s.starts_at, tz)}–${fmtTime(s.ends_at, tz)}`}
                draggable={!!droppable}
                onRemove={onRemove ? () => onRemove(s) : undefined} />
            )
          })}
        </div>
      ))}
    </div>
  )
}

function DropCell({ colKey, min }: { colKey: string; min: number }) {
  const { isOver, setNodeRef } = useDroppable({ id: `${colKey}|${min}` })
  return (
    <div ref={setNodeRef} className={`sched-cell${isOver ? ' over' : ''}`}
      style={{ top: (min - DAY_START) * PX_PER_MIN, height: CELL_MIN * PX_PER_MIN, zIndex: 3 }} />
  )
}

function SlotBlock({ slot, top, height, color, conflict, title, time, draggable, onRemove }: {
  slot: ScheduleSlot; top: number; height: number; color?: string
  conflict: boolean; title: string; time: string; draggable: boolean
  onRemove?: () => void
}) {
  const isBreak = slot.kind !== 'talk'
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `slot-${slot.id}`, data: { kind: 'slot', slot } satisfies DragData, disabled: isBreak || !draggable,
  })
  return (
    <div ref={setNodeRef} {...(draggable ? { ...listeners, ...attributes } : {})}
      className={`sched-slot${isBreak ? ' break' : ''}${conflict ? ' conflict' : ''}${draggable && !isBreak ? '' : ' still'}`}
      style={{ top, height, ['--track' as string]: color, opacity: isDragging ? 0.35 : 1 }}
      title={conflict ? `${title} — CONFLICT` : title}>
      <strong className="truncate" style={{ display: 'block' }}>{conflict && '⚠ '}{title}</strong>
      {height > 34 && <span className="t">{time}</span>}
      {!isBreak && onRemove && (
        <button className="x" aria-label={`Remove ${title} from schedule`}
          onPointerDown={(e) => e.stopPropagation()} onClick={onRemove}>✕</button>
      )}
    </div>
  )
}

function ListView({ slots, days, rooms, tz, conflictIds, trackById, titleOf }: {
  slots: ScheduleSlot[]; days: string[]; rooms: Room[]
} & BlockProps) {
  const roomName = (id: string | null) => rooms.find((r) => r.id === id)?.name
  return (
    <div className="stack" style={{ gap: 16 }}>
      {days.map((d) => {
        const list = slots
          .filter((s) => dayKey(s.starts_at, tz) === d)
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at) || (roomName(a.room_id) ?? '').localeCompare(roomName(b.room_id) ?? ''))
        if (list.length === 0) return null
        return (
          <Card key={d} title={fmtDate(`${d}T12:00:00Z`, { weekday: 'long', month: 'long', day: 'numeric' })} pad={false}>
            <div className="table-wrap">
              <table className="gr">
                <thead><tr><th style={{ width: 140 }}>Time</th><th>Session</th><th>Room</th><th>Track</th><th></th></tr></thead>
                <tbody>
                  {list.map((s) => {
                    const tr = trackById(s.track_id)
                    const conflict = conflictIds.has(s.id)
                    return (
                      <tr key={s.id} style={conflict ? { background: 'var(--danger-soft)' } : undefined}>
                        <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{fmtTime(s.starts_at, tz)}–{fmtTime(s.ends_at, tz)}</td>
                        <td><strong>{conflict && '⚠ '}{titleOf(s)}</strong>{s.kind !== 'talk' && <span className="faint small"> · {s.kind}</span>}</td>
                        <td className="small">{roomName(s.room_id) ?? '—'}</td>
                        <td>{tr ? <span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: tr.color }} />{tr.name}</span> : <span className="faint">—</span>}</td>
                        <td>{conflict && <Badge tone="badge-danger">conflict</Badge>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
