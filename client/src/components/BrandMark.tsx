/**
 * Sigla BonAI (vizorul cu bonul și raza), aceeași cu iconița de instalare.
 */
export function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <span className="os-mark" style={{ width: size, height: size }} aria-hidden="true">
      <img
        src={`${import.meta.env.BASE_URL}icons/bonai-mark.svg?v=1`}
        alt=""
        width={size}
        height={size}
        decoding="sync"
        fetchPriority="high"
      />
    </span>
  );
}
