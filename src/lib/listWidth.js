// Desktop conversation list column width in rem, nav rail included.
export const LIST_WIDTH_DEFAULT = 27
const MIN = 22
const MAX = 36

export const clampListWidth = (rem) => {
  const value = Number(rem)
  if (Number.isNaN(value)) return LIST_WIDTH_DEFAULT
  return Math.min(MAX, Math.max(MIN, value))
}
