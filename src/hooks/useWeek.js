import { useState } from 'react'
import { weekStart, dayDate, formatWeekLabel } from '../constants/days'
import { supabase } from '../lib/supabase'

export function useWeek() {
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

  async function getOrCreateWeek() {
    const isoStart = currentWeekStart.toISOString().slice(0, 10)
    const label = formatWeekLabel(currentWeekStart)

    const { data: existing } = await supabase
      .from('weeks')
      .select('id')
      .eq('start_date', isoStart)
      .single()

    if (existing) return existing.id

    const { data: created, error } = await supabase
      .from('weeks')
      .insert({ start_date: isoStart, label })
      .select('id')
      .single()

    if (error) throw error
    return created.id
  }

  return {
    currentWeekStart,
    weekLabel: formatWeekLabel(currentWeekStart),
    weekStartISO: currentWeekStart.toISOString().slice(0, 10),
    prevWeek,
    nextWeek,
    goToToday,
    getOrCreateWeek,
    dayDate: (offset) => dayDate(currentWeekStart, offset),
  }
}
