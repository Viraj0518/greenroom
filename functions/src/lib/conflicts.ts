// Server-side schedule conflict detection (CONTRACTS.md):
//   - two slots in the same room with overlapping times
//   - the same speaker in two overlapping slots
// Returned on every schedule read/mutation as [{ slotIds, reason }].

export interface SlotForConflicts {
  id: string
  room_id: string | null
  starts_at: string
  ends_at: string
  speaker_id?: string | null
  speaker_name?: string | null
  room_name?: string | null
  title?: string | null
}

export interface Conflict {
  slotIds: string[]
  reason: string
}

function overlaps(a: SlotForConflicts, b: SlotForConflicts): boolean {
  return a.starts_at < b.ends_at && b.starts_at < a.ends_at
}

export function computeConflicts(slots: SlotForConflicts[]): Conflict[] {
  const conflicts: Conflict[] = []
  const seen = new Set<string>()

  const push = (a: SlotForConflicts, b: SlotForConflicts, reason: string) => {
    const key = [a.id, b.id].sort().join('|') + '|' + reason
    if (seen.has(key)) return
    seen.add(key)
    conflicts.push({ slotIds: [a.id, b.id], reason })
  }

  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i]
      const b = slots[j]
      if (!overlaps(a, b)) continue
      if (a.room_id && b.room_id && a.room_id === b.room_id) {
        const room = a.room_name ? `room "${a.room_name}"` : 'the same room'
        push(a, b, `Overlapping slots in ${room}`)
      }
      if (a.speaker_id && b.speaker_id && a.speaker_id === b.speaker_id) {
        const who = a.speaker_name ? `Speaker "${a.speaker_name}"` : 'The same speaker'
        push(a, b, `${who} is double-booked`)
      }
    }
  }
  return conflicts
}
