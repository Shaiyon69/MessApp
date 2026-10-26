/** 40px accent-wash circle that leads a settings or menu row. */
export default function TonalIcon({ icon: Icon, size = 20 }) {
  return (
    <span className="tonal-icon" aria-hidden="true">
      <Icon size={size} />
    </span>
  )
}
