// app/(shoppinglog)/shoppinglog/_components/ListingForm.tsx
'use client';

import { useRef, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Loader2, ImagePlus } from 'lucide-react';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import type { Category } from './CategoryChips';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type ListingFormValues = {
  title: string;
  description: string;
  price: string;
  condition: 'new' | 'used';
  categoryId: string;
  stockQuantity: string;
  images: string[];
};

export function ListingForm({
  categories,
  initial,
  submitLabel,
  onSubmit,
}: {
  categories: Category[];
  initial?: Partial<ListingFormValues>;
  submitLabel: string;
  onSubmit: (values: ListingFormValues) => Promise<void>;
}) {
  const supabase = createClientComponentClient();
  const { profile } = useCurrentProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState(initial?.price ?? '');
  const [condition, setCondition] = useState<'new' | 'used'>(initial?.condition ?? 'used');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categories[0]?.id ?? '');
  const [stockQuantity, setStockQuantity] = useState(initial?.stockQuantity ?? '1');
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (!profile) return;
    if (!file.type.startsWith('image/')) {
      setError('Only image files are supported');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Images must be under 10 MB');
      return;
    }
    setError(null);
    setUploading(true);
    const path = `${profile.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('shoplog-media')
      .upload(path, file, { upsert: false, contentType: file.type });
    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from('shoplog-media').getPublicUrl(path);
    setImages((prev) => [...prev, data.publicUrl]);
    setUploading(false);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim() || !price || !categoryId) {
      setError('Title, description, price, and category are required');
      return;
    }
    setSubmitting(true);
    setError(null);
    await onSubmit({ title, description, price, condition, categoryId, stockQuantity, images });
    setSubmitting(false);
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Standing Desk" />
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Condition details, dimensions, pickup info…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Price ($)</Label>
            <Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Condition</Label>
            <Select value={condition} onValueChange={(v) => setCondition(v as 'new' | 'used')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="used">Used</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Quantity in stock</Label>
            <Input type="number" min="1" value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Photos</Label>
          <div className="flex flex-wrap gap-2">
            {images.map((url) => (
              <div key={url} className="relative size-20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full rounded-md object-cover" />
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((u) => u !== url))}
                  aria-label="Remove photo"
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-background p-0.5 shadow"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex size-20 items-center justify-center rounded-md border border-dashed text-muted-foreground"
            >
              {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) handleFile(file);
              }}
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : submitLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
