import { useEffect, useRef } from "react";
import type { Html5Qrcode } from "html5-qrcode";

const SCANNER_ELEMENT_ID = "rutafacil-barcode-scanner";

/**
 * Camera-based 1D barcode scanner. Only touches `html5-qrcode` inside
 * effects via dynamic import, so this component stays safe to import even
 * in an SSR module graph — the camera never starts until it mounts client-side.
 */
export function BarcodeScanner({ onDetected }: { onDetected: (text: string) => void }) {
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let cancelled = false;
    let scanner: Html5Qrcode | null = null;

    async function start() {
      const { Html5Qrcode: Html5QrcodeCtor, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      if (cancelled) return;

      scanner = new Html5QrcodeCtor(SCANNER_ELEMENT_ID, {
        verbose: false,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR,
        ],
      });

      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 280, height: 140 } },
          (decodedText) => onDetectedRef.current(decodedText),
          () => {
            // per-frame "nothing found" — expected on most frames, ignore
          },
        );
      } catch {
        // camera unavailable or permission denied — manual input still works
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (scanner) {
        scanner
          .stop()
          .then(() => scanner!.clear())
          .catch(() => {});
      }
    };
  }, []);

  return (
    <div
      id={SCANNER_ELEMENT_ID}
      className="w-full overflow-hidden rounded-xl border border-border [&_video]:rounded-xl"
    />
  );
}
