import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useWeek } from '../hooks/useWeek'
import { useCustomers } from '../hooks/useCustomers'
import { useMenuItems } from '../hooks/useMenuItems'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useToast } from '../context/ToastContext'
import { WEEK_DAYS, toLocalISODate, formatShortDate } from '../constants/days'
import { ChevronRight, ChevronLeft, Lock } from 'lucide-react'
import { useTranslation } from '../context/LanguageContext'
import { customerDisplayName } from '../lib/displayName'

export default function Forecasting() {
  const toast = useToast()
  const { t, lang } = useTranslation()
  const week = useWeek()
  const { customers } = useCustomers()
  const { menuItems } = useMenuItems()
  const userEmail = useCurrentUser()
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [forecast, setForecast] = useState({}) // key: `${itemId}_${date}` => qty
  const [overrides, setOverrides] = useState({}) // same key => qty (user edits)
  const [loading, setLoading] = useState(false)
  const [locking, setLocking] = useState(false)
  const [locked, setLocked] = useState({}) // keys already locked this week

  function displayName(item) {
    return lang === 'en' ? (item.name_en || item.name_he) : item.name_he
  }

  useEffect(() => {
    if (customers.length && !selectedCustomer) setSelectedCustomer(customers[0])
  }, [customers])

  useEffect(() => {
    if (selectedCustomer) loadForecast()
    else { setForecast({}); setOverrides({}); setLocked({}) }
  }, [selectedCustomer, week.weekStartISO])

  async function loadForecast() {
    if (!selectedCustomer) return
    setLoading(true)
    try {
      // Get 4 previous weeks' order_lines for rolling average
      const prevWeeks = []
      for (let i = 1; i <= 4; i++) {
        const d = new Date(week.weekStartISO)
        d.setDate(d.getDate() - i * 7)
        prevWeeks.push(toLocalISODate(d))
      }

      const { data: weekRows } = await supabase
        .from('weeks').select('id, start_date').in('start_date', prevWeeks)

      const weekMap = {} // iso → id
      for (const w of weekRows || []) weekMap[w.start_date] = w.id

      const weekIds = Object.values(weekMap)
      const { data: lines } = weekIds.length
        ? await supabase.from('order_lines')
            .select('menu_item_id, delivery_date, quantity, week_id')
            .in('week_id', weekIds)
            .eq('customer_id', selectedCustomer.id)
            .gt('quantity', 0)
        : { data: [] }

      // Build rolling average by (menu_item_id, day_of_week)
      // day_of_week: 0=Sun,...,6=Sat
      const sums = {} // `${menuItemId}_${dow}` => {total, count}
      for (const l of lines || []) {
        const dow = new Date(l.delivery_date + 'T00:00:00').getDay()
        const k = `${l.menu_item_id}_${dow}`
        if (!sums[k]) sums[k] = { total: 0, count: 0 }
        sums[k].total += parseFloat(l.quantity)
        sums[k].count++
      }

      // Build forecast map for the current week
      const fc = {}
      for (const d of WEEK_DAYS) {
        const date = week.dayDate(d.key)
        const dow = new Date(date + 'T00:00:00').getDay()
        for (const item of menuItems) {
          const k = `${item.id}_${dow}`
          if (sums[k] && sums[k].total > 0) {
            const avg = sums[k].total / sums[k].count
            fc[`${item.id}_${date}`] = Math.round(avg * 10) / 10
          }
        }
      }
      setForecast(fc)

      // Check if there are existing 'forecast' lines for this week/customer
      const wid = await week.getOrCreateWeek()
      const { data: existing } = await supabase
        .from('order_lines')
        .select('menu_item_id, delivery_date, quantity')
        .eq('week_id', wid)
        .eq('customer_id', selectedCustomer.id)
        .eq('source', 'forecast')

      const lockedMap = {}
      const overMap = {}
      for (const l of existing || []) {
        const k = `${l.menu_item_id}_${l.delivery_date}`
        lockedMap[k] = true
        overMap[k] = parseFloat(l.quantity)
      }
      setLocked(lockedMap)
      setOverrides(overMap)
    } finally {
      setLoading(false)
    }
  }

  function getQty(itemId, date) {
    const k = `${itemId}_${date}`
    if (overrides[k] !== undefined) return overrides[k]
    return forecast[k] || ''
  }

  function handleOverride(itemId, date, value) {
    const k = `${itemId}_${date}`
    const qty = parseFloat(value)
    setOverrides(prev => {
      const next = { ...prev }
      if (isNaN(qty) || value === '') delete next[k]
      else next[k] = qty
      return next
    })
  }

  async function lockForecast() {
    if (!selectedCustomer) return
    setLocking(true)
    try {
      const wid = await week.getOrCreateWeek()

      // Collect all cells with a forecast qty > 0
      const upserts = []
      for (const d of WEEK_DAYS) {
        const date = week.dayDate(d.key)
        for (const item of menuItems) {
          const k = `${item.id}_${date}`
          const qty = overrides[k] !== undefined ? overrides[k] : (forecast[k] || 0)
          if (qty > 0) {
            upserts.push({
              week_id: wid,
              customer_id: selectedCustomer.id,
              menu_item_id: item.id,
              delivery_date: date,
              quantity: qty,
              source: 'forecast',
              status: 'ok',
              change_reason: 'forecast',
              change_note: 'נעל כתוכנית ייצור מתחזית',
              changed_by: userEmail,
              changed_via: 'forecast_lock',
              updated_at: new Date().toISOString(),
            })
          }
        }
      }

      if (upserts.length) {
        const { error } = await supabase.from('order_lines').upsert(upserts, {
          onConflict: 'week_id,customer_id,menu_item_id,delivery_date',
        })
        if (error) throw error
      }

      // Refresh locked state
      const newLocked = {}
      for (const u of upserts) newLocked[`${u.menu_item_id}_${u.delivery_date}`] = true
      setLocked(newLocked)
      toast.success(upserts.length
        ? `${t('forecasting.lockedToastPrefix')} — ${upserts.length} ${t('forecasting.cells')}`
        : t('forecasting.nothingToLockToast'))
    } catch (err) {
      console.error('[lockForecast]', err)
      toast.error(t('forecasting.lockFailedToast'))
    } finally {
      setLocking(false)
    }
  }

  // Group items by category
  const grouped = menuItems.reduce((acc, item) => {
    const cat = item.category || 'כללי'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  const hasForecast = Object.keys(forecast).length > 0
  const lockedCount = Object.keys(locked).length
  const totalFcQty = WEEK_DAYS.reduce((s, d) => {
    const date = week.dayDate(d.key)
    return s + menuItems.reduce((ss, item) => {
      const k = `${item.id}_${date}`
      const qty = overrides[k] !== undefined ? overrides[k] : (forecast[k] || 0)
      return ss + qty
    }, 0)
  }, 0)

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{t('forecasting.title')}</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lockedCount > 0 && (
            <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ {lockedCount} {t('forecasting.lockedCells')}</span>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={lockForecast}
            disabled={locking || !hasForecast || !selectedCustomer}
            title={t('forecasting.lockTooltip')}
          >
            <Lock size={13} /> {locking ? '...' : t('forecasting.lockButton')}
          </button>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="week-nav">
        <button className="btn btn-ghost btn-sm" onClick={week.prevWeek}><ChevronRight size={16} /></button>
        <span className="week-label">{week.weekLabel}</span>
        <button className="btn btn-ghost btn-sm" onClick={week.nextWeek}><ChevronLeft size={16} /></button>
        <button className="btn btn-ghost btn-sm" onClick={week.goToToday} style={{ fontSize: 12 }}>{t('forecasting.thisWeek')}</button>
      </div>

      <div className="sidebar-layout">
        {/* Customer sidebar */}
        <div>
          <div className="section-title" style={{ marginBottom: 10 }}>{t('common.customer')}</div>
          <div className="customer-list">
            {customers.map(c => (
              <div
                key={c.id}
                className={'customer-pill' + (selectedCustomer?.id === c.id ? ' active' : '')}
                onClick={() => setSelectedCustomer(c)}
              >
                {customerDisplayName(c, lang)}
              </div>
            ))}
          </div>
        </div>

        {/* Forecast grid */}
        <div>
          {!selectedCustomer ? (
            <div className="empty"><div className="empty-icon">👈</div><div className="empty-text">{t('forecasting.selectCustomer')}</div></div>
          ) : loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...Array(6)].map((_, i) => <div key={i} className="shimmer" style={{ height: 40 }} />)}
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bdr)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{customerDisplayName(selectedCustomer, lang)}</span>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--t3)', alignItems: 'center' }}>
                  {totalFcQty > 0 && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{t('forecasting.totalForecast')}: {Math.round(totalFcQty * 10) / 10}</span>}
                  <span>{t('forecasting.avg4Weeks')}</span>
                  <span>📝 {t('forecasting.manualEditable')}</span>
                  {lockedCount > 0 && <span style={{ color: 'var(--green)' }}>🔒 {t('forecasting.lockedLegendInline')}</span>}
                </div>
              </div>

              {!hasForecast ? (
                <div className="empty" style={{ padding: 40 }}>
                  <div className="empty-icon">📉</div>
                  <div className="empty-text">{t('forecasting.noHistoryTitle')}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 8 }}>{t('forecasting.noHistorySubtitle')}</div>
                </div>
              ) : (
                <div className="order-grid-wrap">
                  <table className="order-grid">
                    <thead>
                      <tr>
                        <th className="item-col sticky-col">{t('common.item')}</th>
                        <th style={{ fontSize: 10, color: 'var(--t3)' }}>{t('common.supplier')}</th>
                        {WEEK_DAYS.map(d => (
                          <th key={d.key}>
                            <div>{lang === 'en' ? d.short_en : d.short}</div>
                            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
                              {formatShortDate(week.dayDate(d.key))}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(grouped).map(([cat, items]) => {
                        const catHasFc = items.some(item =>
                          WEEK_DAYS.some(d => {
                            const date = week.dayDate(d.key)
                            const k = `${item.id}_${date}`
                            return forecast[k] || overrides[k]
                          })
                        )
                        if (!catHasFc) return null
                        return (
                          <>
                            <tr key={`cat-${cat}`}>
                              <td colSpan={9} style={{ padding: '8px 16px', background: 'var(--surf2)', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                                {cat}
                              </td>
                            </tr>
                            {items.map(item => {
                              const hasAny = WEEK_DAYS.some(d => {
                                const date = week.dayDate(d.key)
                                const k = `${item.id}_${date}`
                                return forecast[k] || overrides[k]
                              })
                              if (!hasAny) return null
                              return (
                                <tr key={item.id}>
                                  <td className="item-name sticky-col">{displayName(item)}</td>
                                  <td className="item-supplier">{item.suppliers?.name || '—'}</td>
                                  {WEEK_DAYS.map(d => {
                                    const date = week.dayDate(d.key)
                                    const k = `${item.id}_${date}`
                                    const fcQty = forecast[k]
                                    const ov = overrides[k]
                                    const isLocked = locked[k]
                                    const displayVal = ov !== undefined ? ov : (fcQty || '')
                                    return (
                                      <td key={d.key} style={{ textAlign: 'center' }}>
                                        <input
                                          type="number"
                                          className={'qty-cell' + (isLocked ? ' qty-cell-locked' : '')}
                                          min="0"
                                          step="0.5"
                                          value={displayVal}
                                          placeholder={fcQty ? String(fcQty) : '—'}
                                          style={ov !== undefined && ov !== fcQty ? { borderColor: 'var(--amber)', color: 'var(--amber)' } : {}}
                                          onChange={e => handleOverride(item.id, date, e.target.value)}
                                          title={isLocked ? t('forecasting.lockedInputTitle') : fcQty ? `${t('forecasting.forecastLabel')}: ${fcQty}` : ''}
                                        />
                                      </td>
                                    )
                                  })}
                                </tr>
                              )
                            })}
                          </>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ padding: '10px 20px', borderTop: '1px solid var(--bdr)', display: 'flex', gap: 16, fontSize: 12, color: 'var(--t3)' }}>
                <span>⬜ {t('forecasting.legendForecast')}</span>
                <span style={{ color: 'var(--amber)' }}>🟨 {t('forecasting.legendManual')}</span>
                <span style={{ color: 'var(--accent)' }}>🟦 {t('forecasting.legendLocked')}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
