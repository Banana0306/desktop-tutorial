const map = {
  // Orders
  '已完成': 'badge-green',
  '已到貨': 'badge-green',
  '清關完成': 'badge-green',
  '正常':   'badge-green',
  '運送中': 'badge-cyan',
  '待出貨': 'badge-amber',
  '備貨中': 'badge-amber',
  '待確認': 'badge-muted',
  '已取消': 'badge-red',
  '缺貨':   'badge-red',
  '低庫存': 'badge-amber',
}

export default function StatusBadge({ status }) {
  const cls = map[status] ?? 'badge-muted'
  return <span className={`badge ${cls}`}>{status}</span>
}
