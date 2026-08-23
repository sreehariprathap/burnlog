'use client';

import { useState, useRef } from 'react';
import { Camera, Upload, Loader2, CheckCircle, AlertTriangle, X, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { categoryLabel } from '@/lib/financeCategories';

type ScanResult = {
  merchant: string;
  amount: number;
  date: string;
  category: string;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
};

type ReceiptScannerProps = {
  onResult: (result: ScanResult) => void;
  onClose: () => void;
};

const CONFIDENCE_COLORS = {
  high: 'text-emerald-600 dark:text-emerald-400',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-red-600 dark:text-red-400',
};

export function ReceiptScanner({ onResult, onClose }: ReceiptScannerProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10 MB');
      return;
    }
    setError(null);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setPreview(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleScan = async () => {
    if (!preview) return;
    setScanning(true);
    setError(null);

    try {
      const res = await fetch('/api/ai/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: preview }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to analyse receipt. Try again.');
        setScanning(false);
        return;
      }

      setResult(data as ScanResult);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setScanning(false);
    }
  };

  const handleLog = () => {
    if (result) onResult(result);
  };

  const reset = () => {
    setPreview(null);
    setResult(null);
    setError(null);
  };

  return (
    <Drawer open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Scan Receipt
          </DrawerTitle>
          <p className="text-xs text-muted-foreground">AI reads the merchant, amount and date, then you review before saving</p>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          {!preview ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 h-28 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <Camera className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">Take Photo</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 h-28 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">Upload Photo</span>
              </button>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Receipt preview" className="w-full max-h-64 object-contain rounded-xl border border-border" />
                <button
                  type="button"
                  onClick={reset}
                  className="absolute top-2 right-2 h-8 w-8 rounded-full bg-background/90 border border-border flex items-center justify-center"
                  aria-label="Remove photo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {!result && !scanning && (
                <Button onClick={handleScan} className="w-full gap-2">
                  <Receipt className="h-4 w-4" />
                  Analyse Receipt
                </Button>
              )}

              {scanning && (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Reading receipt...
                </div>
              )}

              {result && (
                <div className="rounded-xl border border-border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{result.merchant}</span>
                    <span className={CONFIDENCE_COLORS[result.confidence]}>
                      <CheckCircle className="h-4 w-4 inline mr-1" />
                      {result.confidence} confidence
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-semibold">{result.amount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Category</span>
                    <span>{categoryLabel(result.category)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Date</span>
                    <span>{result.date}</span>
                  </div>
                  {result.notes && <p className="text-xs text-muted-foreground pt-1">{result.notes}</p>}

                  <Button onClick={handleLog} className="w-full mt-2">
                    Use These Details
                  </Button>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
