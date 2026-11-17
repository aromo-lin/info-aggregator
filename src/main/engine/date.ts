// 把小红书常见的几种日期格式归一为 Date：
//   "MM-DD"、 "MM-DD 地区"、 "YYYY-MM-DD"、 "YYYY-MM-DD 地区"
// 无年份时按 ref 推断为“不晚于 ref 的最近一个该月日”。
export function parseDate(input: string | undefined, ref: Date = new Date()): Date | null {
  if (!input) return null
  const s = input.trim()
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/) ?? s.match(/^(\d{1,2})-(\d{1,2})/)
  if (!m) return null

  const hasYear = m[1].length === 4
  let year = hasYear ? Number(m[1]) : ref.getFullYear()
  let month = hasYear ? Number(m[2]) : Number(m[1])
  const day = hasYear ? Number(m[3]) : Number(m[2])

  let candidate = new Date(year, month - 1, day)
  if (!hasYear && candidate > ref) {
    candidate = new Date(year - 1, month - 1, day)
  }
  return candidate
}
