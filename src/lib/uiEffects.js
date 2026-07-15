/** Applies pointer-driven spotlight CSS variables to interactive surfaces. */
export const trackSpotlight = (event) => {
  const rect = event.currentTarget.getBoundingClientRect()
  event.currentTarget.style.setProperty('--spotlight-x', `${event.clientX - rect.left}px`)
  event.currentTarget.style.setProperty('--spotlight-y', `${event.clientY - rect.top}px`)
}
