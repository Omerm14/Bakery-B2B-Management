import { useState } from 'react'
import { weekStart, dayDate, formatWeekLabel, toLocalISODate } from '../constants/days'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'

export function useWeek() {
  const { organizationId } = useTenant()
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

  // Jumps straight to the week containing an arbitrary date (e.g. a week's
  // start_date from a notification), instead of stepping via prev/next.
  function goToWeekStart(dateOrIso) {
    setCurrentWeekStart(weekStart(new Date(dateOrIso)))
  }

  async function getOrCreateWeek() {
    if (!organizationId) throw new Error('getOrCreateWeek called with no organization in context')
    const isoStart = toLocalISODate(currentWeekStart)
    const label = formatWeekLabel(currentWeekStart)

    const { data: existing } = await supabase
      .from('weeks')
      .select('id')
      .eq('start_date', isoStart)
      .eq('organization_id', organizationId)
      .single()

    if (existing) return existing.id

    const { data: created, error } = await supabase
      .from('weeks')
      .insert({ start_date: isoStart, label, organization_id: organizationId })
      .select('id')
      .single()

    if (error) throw error
    return created.id
  }

  return {
    currentWeekStart,
    weekLabel: formatWeekLabel(currentWeekStart),
    weekStartISO: toLocalISODate(currentWeekStart),
    prevWeek,
    nextWeek,
    goToToday,
    goToWeekStart,
    getOrCreateWeek,
    dayDate: (offset) => dayDate(currentWeekStart, offset),
  }
}
