import { useState } from 'react'
import { weekStart, dayDate, formatWeekLabel } from '../constants/days'
import { supabase } from '../lib/supabase'

// Read-only sibling of useWeek — customers only have SELECT access to
// `weeks` (creating weeks stays a staff/cron responsibility, see
// migration 008), so this never inserts a row. If the week hasn't been
// created yet (e.g. next week, before Wednesday's auto-copy has run),
// getWeekId() resolves to null and the caller should show an empty state.
export function useCustomerWeek() {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => weekStart())

  function prevWeek() {
    setCurrentWeekStart(d => {
      const prev = new Date(d)
      prev.setDate(prev.getDate() - 7)
      return prev
    })
  }

  function nextWeek() {
    setCurrentWeekStart(d => {
      const next = new Date(d)
      next.setDate(next.getDate() + 7)
      return next
    })
  }

  function goToToday() {
    setCurrentWeekStart(weekStart())
  }

  // Returns { id, error } rather than just the id — null id alone can't
  // tell the caller whether the week genuinely doesn't exist yet (normal,
  // e.g. next week before Wednesday's auto-copy) or the query itself
  // failed (a real problem worth surfacing, not a quiet empty state).
  async function getWeekId() {
    const isoStart = currentWeekStart.toISOString().slice(0, 10)
    const { data, error } = await supabase.from('weeks').select('id').eq('start_date', isoStart).maybeSingle()
    return { id: data?.id ?? null, error }
  }

  return {
    currentWeekStart,
    weekLabel: formatWeekLabel(currentWeekStart),
    weekStartISO: currentWeekStart.toISOString().slice(0, 10),
    prevWeek,
    nextWeek,
    goToToday,
    getWeekId,
    dayDate: (offset) => dayDate(currentWeekStart, offset),
  }
}
