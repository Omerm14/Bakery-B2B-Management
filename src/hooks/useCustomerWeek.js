import { useState } from 'react'
import { weekStart, dayDate, formatWeekLabel, toLocalISODate } from '../constants/days'
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

  async function getWeekId() {
    const isoStart = toLocalISODate(currentWeekStart)
    const { data } = await supabase.from('weeks').select('id').eq('start_date', isoStart).maybeSingle()
    return data?.id ?? null
  }

  return {
    currentWeekStart,
    weekLabel: formatWeekLabel(currentWeekStart),
    weekStartISO: toLocalISODate(currentWeekStart),
    prevWeek,
    nextWeek,
    goToToday,
    getWeekId,
    dayDate: (offset) => dayDate(currentWeekStart, offset),
  }
}
