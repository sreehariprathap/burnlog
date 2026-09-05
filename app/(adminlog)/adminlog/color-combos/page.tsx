'use client';

import { useEffect, useState } from 'react';
import { Loader2, Trash2, Edit2, Plus } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { apiFetch } from '@/lib/apiFetch';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { TEMPLATE_COLOR_COMBOS } from '@/lib/theme/colorCombos';

interface ColorCombo {
  id: string;
  name: string;
  description: string | null;
  primaryLight: string;
  primaryDark: string;
  backgroundLight: string;
  backgroundDark: string;
  isTemplate: boolean;
}

function ComboCard({
  combo,
  onEdit,
  onDelete,
  isDeleting,
}: {
  combo: ColorCombo;
  onEdit: (combo: ColorCombo) => void;
  onDelete: (id: string) => Promise<void>;
  isDeleting: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">{combo.name}</p>
            {combo.description && <p className="text-xs text-muted-foreground">{combo.description}</p>}
          </div>
          {combo.isTemplate && <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded">Template</span>}
        </div>
        <div className="flex gap-1.5">
          <div className="flex-1 flex flex-col gap-1">
            <div className="text-xs text-muted-foreground">Light</div>
            <div className="flex gap-1">
              <div
                className="flex-1 h-12 rounded border"
                style={{ background: combo.backgroundLight, borderColor: combo.primaryLight }}
              />
              <div className="w-12 h-12 rounded border" style={{ background: combo.primaryLight }} />
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <div className="text-xs text-muted-foreground">Dark</div>
            <div className="flex gap-1">
              <div
                className="flex-1 h-12 rounded border"
                style={{ background: combo.backgroundDark, borderColor: combo.primaryDark }}
              />
              <div className="w-12 h-12 rounded border" style={{ background: combo.primaryDark }} />
            </div>
          </div>
        </div>
        {!combo.isTemplate && (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => onEdit(combo)}>
              <Edit2 className="size-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={isDeleting}
              onClick={() => onDelete(combo.id)}
            >
              {isDeleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ColorCombosPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const [combos, setCombos] = useState<ColorCombo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    primaryLight: '#000000',
    primaryDark: '#ffffff',
    backgroundLight: '#ffffff',
    backgroundDark: '#000000',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.isAdmin) return;
    (async () => {
      setLoading(true);
      const res = await apiFetch('/api/adminlog/color-combos');
      if (res.ok) {
        setCombos(await res.json());
      }
      setLoading(false);
    })();
  }, [profile?.isAdmin]);

  async function handleSave() {
    if (!formData.name.trim()) return;
    setSaving(true);
    try {
      const method = editingId ? 'PUT' : 'POST';
      const body = editingId ? { id: editingId, ...formData } : formData;
      const res = await apiFetch('/api/adminlog/color-combos', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setCombos((prev) =>
          editingId ? prev.map((c) => (c.id === editingId ? data : c)) : [...prev, data]
        );
        setShowForm(false);
        setEditingId(null);
        setFormData({
          name: '',
          description: '',
          primaryLight: '#000000',
          primaryDark: '#ffffff',
          backgroundLight: '#ffffff',
          backgroundDark: '#000000',
        });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await apiFetch(`/api/adminlog/color-combos?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCombos((prev) => prev.filter((c) => c.id !== id));
      }
    } finally {
      setDeleting(null);
    }
  }

  function handleEdit(combo: ColorCombo) {
    setFormData({
      name: combo.name,
      description: combo.description || '',
      primaryLight: combo.primaryLight,
      primaryDark: combo.primaryDark,
      backgroundLight: combo.backgroundLight,
      backgroundDark: combo.backgroundDark,
    });
    setEditingId(combo.id);
    setShowForm(true);
  }

  if (profileLoading || !profile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <p className="text-sm text-muted-foreground">
        Create and manage color palettes (combos). Templates are read-only shipped examples; you can create custom
        combos and use them in App Theme settings. Each combo bundles primary + background colors for light and dark modes.
      </p>

      {!showForm && (
        <Button type="button" onClick={() => setShowForm(true)}>
          <Plus className="size-4" /> New Color Combo
        </Button>
      )}

      {showForm && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Ocean Blue, Warm Sunset"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
                className="rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="primaryLight">Primary (light)</Label>
                <input
                  id="primaryLight"
                  type="color"
                  value={formData.primaryLight}
                  onChange={(e) => setFormData((prev) => ({ ...prev, primaryLight: e.target.value }))}
                  className="h-9 w-full rounded-md border border-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="backgroundLight">Background (light)</Label>
                <input
                  id="backgroundLight"
                  type="color"
                  value={formData.backgroundLight}
                  onChange={(e) => setFormData((prev) => ({ ...prev, backgroundLight: e.target.value }))}
                  className="h-9 w-full rounded-md border border-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="primaryDark">Primary (dark)</Label>
                <input
                  id="primaryDark"
                  type="color"
                  value={formData.primaryDark}
                  onChange={(e) => setFormData((prev) => ({ ...prev, primaryDark: e.target.value }))}
                  className="h-9 w-full rounded-md border border-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="backgroundDark">Background (dark)</Label>
                <input
                  id="backgroundDark"
                  type="color"
                  value={formData.backgroundDark}
                  onChange={(e) => setFormData((prev) => ({ ...prev, backgroundDark: e.target.value }))}
                  className="h-9 w-full rounded-md border border-input"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" disabled={saving} onClick={handleSave}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : editingId ? 'Update' : 'Create'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      ) : (
        <div className="space-y-6">
          {combos.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground text-center py-8">No custom color combos yet. Click &quot;New Color Combo&quot; to create one.</p>
          )}
          {combos.length > 0 && (
            <>
              <div>
                <h3 className="text-sm font-semibold mb-3">Your Combos</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {combos
                    .filter((c) => !c.isTemplate)
                    .map((combo) => (
                      <ComboCard
                        key={combo.id}
                        combo={combo}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        isDeleting={deleting === combo.id}
                      />
                    ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-3">Template Palettes (Read-Only)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {combos
                    .filter((c) => c.isTemplate)
                    .map((combo) => (
                      <ComboCard
                        key={combo.id}
                        combo={combo}
                        onEdit={() => {}}
                        onDelete={() => Promise.resolve()}
                        isDeleting={false}
                      />
                    ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
