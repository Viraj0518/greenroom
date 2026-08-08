import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { api } from '../../api'
import { useOrg } from './OrgLayout'
import type { Conflict, Room, ScheduleSlot, Submission, Track } from '../../types'
import { dayKey, dayRange, fmtDate, fmtTime, tzMinutesOfDay, zonedToUtc } from '../../lib'
import { Card, EmptyState, Spinner, Tabs, useToast } from '../../components/ui'
import '../../styles/schedule.css'

const DAY_START = 8 * 60   // 08:00 event-local
const DAY_END = 19 * 60    // 19:00
const PX_PER_MIN = 1.2
const CELL_MIN = 15        // drop granularity
const DEFAULT_TALK_MIN = 30

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
  const [day, setDay] = useState('')
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
    })
  }, [event.id, days])

  const trackById = useCallback((id: string | null) => tracks.find((t) => t.id === id), [tracks])
  const trackByName = useCallback((name: string | null) => tracks.find((t) => t.name === name), [tracks])
  const subById = useCallback((id: string | null) => subs.find((s) => s.id === id), [subs])

  const scheduledSubIds = useMemo(() => new Set(slots.map((s) => s.submission_id).filter(Boolean)), [slots])
  const tray = subs.filter((s) => !scheduledSubIds.has(s.id))
  const daySlots = slots.filter((s) => dayKey(s.starts_at, tz) === day)
  const conflictSlotIds = useMemo(() => new Set(conflicts.flatMap((c) => c.slotIds)), [conflicts])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  async function onDragEnd(e: DragEndEvent) {
    setDragging(null)
    const data = e.active.data.current as DragData | undefined
    const overId = e.over?.id as string | undefined
    if (!data || !overId) return
    const [roomId, minStr] = overId.split('|')
    const startMin = Number(minStr)

    try {
      if (data.kind === 'sub' && data.submission) {
        const starts_at = zonedToUtc(day, startMin, tz)
        const ends_at = zonedToUtc(day, startMin + DEFAULT_TALK_MIN, tz)
        const res = await api.createSlot(event.id, {
          submission_id: data.submission.id, room_id: roomId, starts_at, ends_at, kind: 'talk',
        })
        setSlots((sl) => [...sl, res.slot])
        setConflicts(res.conflicts)
      } else if (data.kind === 'slot' && data.slot) {
        const dur = (new Date(data.slot.ends_at).getTime() - new Date(data.slot.starts_at).getTime()) / 60000
        const starts_at = zonedToUtc(day, startMin, tz)
        const ends_at = zonedToUtc(day, startMin + dur, tz)
        const res = await api.updateSlot(data.slot.id, { room_id: roomId, starts_at, ends_at })
        setSlots((sl) => sl.map((x) => (x.id === data.slot!.id ? res.slot : x)))
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
      setConflicts(res.conflicts)
      toast('Removed from schedule')
    } catch {
      setSlots((sl) => [...sl, slot])
      toast('Could not remove the slot', { error: true })
    }
  }

  if (!rooms) return <Spinner label="Loading schedule…" />

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
          <strong>⚠ {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''}:</strong>{' '}
          {conflicts.map((c) => c.reason).join(' · ')}
        </div>
      )}

      <div className="sched-layout">
        <Card title={`Unscheduled (${tray.length})`} pad={false}>
          <div className="sched-tray-list">
            {tray.length === 0 && <p className="muted small" style={{ padding: 10 }}>All accepted talks are scheduled 🎉</p>}
            {tray.map((s) => <TrayChip key={s.id} sub={s} color={trackByName(s.track)?.color} />)}
          </div>
        </Card>

        <Card pad={false}>
          <div style={{ padding: '10px 14px 0' }}>
            <Tabs value={day} onChange={setDay}
              tabs={days.map((d) => ({ key: d, label: fmtDate(`${d}T12:00:00Z`, { weekday: 'short', month: 'short', day: 'numeric' }) }))} />
          </div>
          <div className="sched-grid-wrap">
            <Grid rooms={rooms} slots={daySlots} tz={tz} conflictIds={conflictSlotIds}
              trackById={trackById} subById={subById} onRemove={removeSlot} dragging={!!dragging} />
          </div>
        </Card>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging?.kind === 'sub' && dragging.submission && (
          <div className="sched-chip" style={{ ['--track' as string]: trackByName(dragging.submission.track)?.color }}>
            <strong>{dragging.submission.title}</strong>
          </div>
        )}
        {dragging?.kind === 'slot' && dragging.slot && (
          <div className="sched-chip" style={{ ['--track' as string]: trackById(dragging.slot.track_id)?.color }}>
            <strong>{dragging.slot.title ?? subById(dragging.slot.submission_id)?.title}</strong>
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

function Grid({ rooms, slots, tz, conflictIds, trackById, subById, onRemove, dragging }: {
  rooms: Room[]; slots: ScheduleSlot[]; tz: string
  conflictIds: Set<string>
  trackById: (id: string | null) => Track | undefined
  subById: (id: string | null) => Submission | undefined
  onRemove: (s: ScheduleSlot) => void
  dragging: boolean
}) {
  const height = (DAY_END - DAY_START) * PX_PER_MIN
  const hours: number[] = []
  for (let m = DAY_START; m <= DAY_END; m += 60) hours.push(m)

  return (
    <div className="sched-grid" style={{ gridTemplateColumns: `52px repeat(${rooms.length}, minmax(150px, 1fr))` }}>
      <div className="sched-head" aria-hidden />
      {rooms.map((r) => (
        <div key={r.id} className="sched-head">
          {r.name}
          {r.capacity != null && <div className="faint small" style={{ fontWeight: 500 }}>{r.capacity} seats</div>}
        </div>
      ))}

      <div className="sched-timecol" style={{ height }}>
        {hours.map((m) => (
          <span key={m} className="sched-time" style={{ top: (m - DAY_START) * PX_PER_MIN }}>
            {String(Math.floor(m / 60)).padStart(2, '0')}:00
          </span>
        ))}
      </div>

      {rooms.map((r) => (
        <div key={r.id} className="sched-col" style={{ height }}>
          {hours.map((m) => (
            <div key={m} className="sched-hourline" style={{ top: (m - DAY_START) * PX_PER_MIN }} aria-hidden />
          ))}
          {dragging && Array.from({ length: (DAY_END - DAY_START) / CELL_MIN }, (_, i) => (
            <DropCell key={i} roomId={r.id} min={DAY_START + i * CELL_MIN} />
          ))}
          {slots.filter((s) => s.room_id === r.id).map((s) => {
            const start = tzMinutesOfDay(s.starts_at, tz)
            const end = tzMinutesOfDay(s.ends_at, tz)
            return (
              <SlotBlock key={s.id} slot={s} top={(start - DAY_START) * PX_PER_MIN}
                height={Math.max((end - start) * PX_PER_MIN, 22)}
                color={trackById(s.track_id)?.color}
                conflict={conflictIds.has(s.id)}
                title={s.title ?? subById(s.submission_id)?.title ?? 'Untitled'}
                time={`${fmtTime(s.starts_at, tz)}–${fmtTime(s.ends_at, tz)}`}
                onRemove={() => onRemove(s)} />
            )
          })}
        </div>
      ))}
    </div>
  )
}

function DropCell({ roomId, min }: { roomId: string; min: number }) {
  const { isOver, setNodeRef } = useDroppable({ id: `${roomId}|${min}` })
  return (
    <div ref={setNodeRef} className={`sched-cell${isOver ? ' over' : ''}`}
      style={{ top: (min - DAY_START) * PX_PER_MIN, height: CELL_MIN * PX_PER_MIN, zIndex: 3 }} />
  )
}

function SlotBlock({ slot, top, height, color, conflict, title, time, onRemove }: {
  slot: ScheduleSlot; top: number; height: number; color?: string
  conflict: boolean; title: string; time: string; onRemove: () => void
}) {
  const isBreak = slot.kind !== 'talk'
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `slot-${slot.id}`, data: { kind: 'slot', slot } satisfies DragData, disabled: isBreak,
  })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={`sched-slot${isBreak ? ' break' : ''}${conflict ? ' conflict' : ''}`}
      style={{ top, height, ['--track' as string]: color, opacity: isDragging ? 0.35 : 1 }}
      title={conflict ? `${title} — CONFLICT` : title}>
      <strong className="truncate" style={{ display: 'block' }}>{conflict && '⚠ '}{title}</strong>
      {height > 34 && <span className="t">{time}</span>}
      {!isBreak && (
        <button className="x" aria-label={`Remove ${title} from schedule`}
          onPointerDown={(e) => e.stopPropagation()} onClick={onRemove}>✕</button>
      )}
    </div>
  )
}
