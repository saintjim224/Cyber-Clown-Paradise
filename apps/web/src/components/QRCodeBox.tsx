"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function QRCodeBox({ value }: { value: string }) {
  const [src, setSrc] = useState<string>("");

  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: 144, color: { dark: "#100d24", light: "#ffffff" } })
      .then(setSrc)
      .catch(() => setSrc(""));
  }, [value]);

  return <div className="qr-box">{src ? <img src={src} width={144} height={144} alt="回放二维码" /> : null}</div>;
}
