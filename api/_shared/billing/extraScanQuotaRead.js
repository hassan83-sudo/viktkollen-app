import { extraScanConfig } from './extraScanCheckout.js'

// Display accounting only; reservation RPCs remain authoritative.
export async function subscriptionOnlyReservations(client, userId, rows) {
  if (!extraScanConfig()) return rows
  const { data, error } = await client.schema('billing').rpc('extra_scan_purchase', { p_action: 'allocations', p_user_id: userId, p_data: {} })
  if (error || !Array.isArray(data)) throw new Error('quota_read_failed')
  return rows.map(row => {
    const purchased = data.filter(a => a.reservation_id === row.reservation_id && a.status === row.status).reduce((sum, a) => sum + a.quantity, 0)
    return { ...row, quantity: Math.max(0, row.quantity - purchased), actual_quantity: row.actual_quantity == null ? null : Math.max(0, row.actual_quantity - purchased) }
  })
}
