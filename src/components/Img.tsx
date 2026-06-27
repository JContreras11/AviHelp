"use client";

import Zoom from "react-medium-image-zoom";
import "react-medium-image-zoom/dist/styles.css";
import { urlFoto } from "@/lib/media";

// Imagen con click + zoom (pellizcar en móvil). Acepta dataURL, http o path de Storage.
export function Img({
  src,
  alt = "",
  className = "",
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
}) {
  const url = urlFoto(src);
  if (!url) return null;
  return (
    <Zoom>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className={className} />
    </Zoom>
  );
}
