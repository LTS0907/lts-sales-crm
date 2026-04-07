interface RevenueRow {
  fiscalMonth: string // "2026-04"
  totalAmount: number
}

interface YearTotal {
  year: number
  months: number[] // 12要素 (1月〜12月)
  total: number
}

function aggregate(rows: RevenueRow[]): YearTotal[] {
  const byYear = new Map<number, number[]>()
  for (const r of rows) {
    const [yStr, mStr] = r.fiscalMonth.split('-')
    const year = parseInt(yStr)
    const month = parseInt(mStr) // 1-12
    if (!byYear.has(year)) byYear.set(year, new Array(12).fill(0))
    byYear.get(year)![month - 1] += r.totalAmount
  }
  return Array.from(byYear.entries())
    .map(([year, months]) => ({ year, months, total: months.reduce((s, v) => s + v, 0) }))
    .sort((a, b) => b.year - a.year) // 新しい年が上
}

function fmt(n: number): string {
  if (n === 0) return '—'
  if (n >= 10000) return `¥${(n / 10000).toFixed(n % 10000 === 0 ? 0 : 1)}万`
  return `¥${n.toLocaleString()}`
}

export default function RevenueByYearTable({
  rows,
  title = '売上集計',
  emptyMessage = '売上データがまだありません',
}: {
  rows: RevenueRow[]
  title?: string
  emptyMessage?: string
}) {
  const years = aggregate(rows)
  const grandTotal = years.reduce((s, y) => s + y.total, 0)

  if (years.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
        <p className="text-sm text-gray-500">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        <span className="text-sm font-bold text-green-600">累計 ¥{grandTotal.toLocaleString()}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
              <th className="text-left px-3 py-2 font-medium sticky left-0 bg-gray-50">年</th>
              {Array.from({ length: 12 }, (_, i) => (
                <th key={i} className="text-right px-2 py-2 font-medium whitespace-nowrap">{i + 1}月</th>
              ))}
              <th className="text-right px-3 py-2 font-medium bg-blue-50 text-blue-700 whitespace-nowrap">年合計</th>
            </tr>
          </thead>
          <tbody>
            {years.map(y => (
              <tr key={y.year} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-3 py-2 font-medium sticky left-0 bg-white">{y.year}年</td>
                {y.months.map((amount, i) => (
                  <td key={i} className={`text-right px-2 py-2 whitespace-nowrap ${amount > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                    {fmt(amount)}
                  </td>
                ))}
                <td className="text-right px-3 py-2 bg-blue-50 text-blue-700 font-bold whitespace-nowrap">
                  ¥{y.total.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
