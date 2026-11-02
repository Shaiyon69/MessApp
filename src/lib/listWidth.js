// Desktop conversation list column width in rem, nav rail included.
// Rail plus a Discord-width channel list; the content takes the rest.
export const LIST_WIDTH_DEFAULT = 21
const MIN = 18
const MAX = 32

export const clampListWidth = (rem) => {
  const value = Number(rem)
  if (Number.isNaN(value)) return LIST_WIDTH_DEFAULT
  return Math.min(MAX, Math.max(MIN, value))
}
