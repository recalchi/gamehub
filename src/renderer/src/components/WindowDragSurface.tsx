export default function WindowDragSurface(): JSX.Element {
  return (
    <>
      <div className="window-drag-strip" aria-hidden="true" />
      <div className="window-drag-corner window-drag-corner-left" aria-hidden="true" />
      <div className="window-drag-corner window-drag-corner-right" aria-hidden="true" />
    </>
  )
}
