export function HazardTape({ height = 8 }: { height?: number }) {
  return <div className="hazard-tape" aria-hidden="true" style={{ height }} />;
}
