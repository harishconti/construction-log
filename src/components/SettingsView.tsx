'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, Plus } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Field, Select, TextInput, Textarea, DateInput } from '@/components/ui/inputs';
import { useToast } from '@/components/ui/Toast';
import { todayIST } from '@/lib/period';

type Project = {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  status: string;
  version: number;
};
type Category = { id: string; name: string; type: string; isActive: boolean };

const CATEGORY_TYPES = ['material', 'labour', 'tax', 'utility', 'misc'];
const TYPE_LABEL: Record<string, string> = {
  material: 'Material',
  labour: 'Labour',
  tax: 'Tax',
  utility: 'Utility',
  misc: 'Misc',
};

export function SettingsView({ projectId, initialProject }: { projectId: string; initialProject: Project }) {
  const toast = useToast();
  const [project, setProject] = useState(initialProject);
  const [name, setName] = useState(initialProject.name);
  const [description, setDescription] = useState(initialProject.description ?? '');
  const [startDate, setStartDate] = useState(todayIST(new Date(initialProject.startDate)));
  const [status, setStatus] = useState(initialProject.status);
  const [savingProject, setSavingProject] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState('material');
  const [addingCat, setAddingCat] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    try {
      const res = await api.get<{ categories: Category[] }>(
        `/api/projects/${projectId}/categories?includeInactive=true`,
      );
      setCategories(res.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load categories');
    }
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCategories();
  }, [loadCategories]);

  async function saveProject(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavingProject(true);
    try {
      const res = await api.patch<{ project: Project }>(`/api/projects/${projectId}`, {
        name,
        description: description || null,
        startDate, // bare YYYY-MM-DD: the server reads it as an IST calendar date
        status,
        version: project.version,
      });
      setProject(res.project);
      toast.notify('Project saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save project');
    } finally {
      setSavingProject(false);
    }
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAddingCat(true);
    try {
      await api.post(`/api/projects/${projectId}/categories`, { name: catName, type: catType });
      setCatName('');
      toast.notify('Category added');
      void loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add category');
    } finally {
      setAddingCat(false);
    }
  }

  async function toggleCategory(c: Category) {
    setError(null);
    try {
      await api.patch(`/api/projects/${projectId}/categories/${c.id}`, { isActive: !c.isActive });
      void loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update category');
    }
  }

  async function saveRename(c: Category) {
    const next = renameValue.trim();
    if (!next || next === c.name) {
      setRenamingId(null);
      return;
    }
    setError(null);
    try {
      await api.patch(`/api/projects/${projectId}/categories/${c.id}`, { name: next });
      setRenamingId(null);
      toast.notify('Category renamed');
      void loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename');
    }
  }

  const active = categories.filter((c) => c.isActive);
  const inactive = categories.filter((c) => !c.isActive);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Settings</h1>
      {error && <Alert message={error} />}

      <form onSubmit={saveProject} className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <h2 className="font-display text-lg font-semibold">Project</h2>
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Start date">
            <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {['active', 'paused', 'completed'].map((s) => (
                <option key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" loading={savingProject}>
          Save project
        </Button>
      </form>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="font-display text-lg font-semibold">Categories</h2>
        <form onSubmit={addCategory} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <Field label="Name">
            <TextInput required placeholder="Category name" value={catName} onChange={(e) => setCatName(e.target.value)} />
          </Field>
          <Field label="Type">
            <Select value={catType} onChange={(e) => setCatType(e.target.value)}>
              {CATEGORY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" loading={addingCat} className="h-11">
            <Plus size={16} aria-hidden /> Add
          </Button>
        </form>

        <ul className="mt-4 divide-y divide-border">
          {active.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              {renamingId === c.id ? (
                <span className="flex flex-1 items-center gap-2">
                  <TextInput
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void saveRename(c);
                      } else if (e.key === 'Escape') {
                        setRenamingId(null);
                      }
                    }}
                    aria-label={`New name for ${c.name}`}
                    autoFocus
                  />
                  <Button type="button" onClick={() => saveRename(c)} aria-label="Save name">
                    <Check size={16} aria-hidden />
                  </Button>
                </span>
              ) : (
                <span>
                  {c.name} <span className="text-xs text-ink-3">({TYPE_LABEL[c.type] ?? c.type})</span>
                </span>
              )}
              <span className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  aria-label={`Rename ${c.name}`}
                  onClick={() => {
                    setRenamingId(c.id);
                    setRenameValue(c.name);
                  }}
                >
                  <Pencil size={15} aria-hidden /> Rename
                </Button>
                <Button variant="ghost" aria-label={`Deactivate ${c.name}`} onClick={() => toggleCategory(c)}>
                  Deactivate
                </Button>
              </span>
            </li>
          ))}
        </ul>

        {inactive.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowInactive((v) => !v)}
              aria-expanded={showInactive}
              className="min-h-11 text-sm text-ink-3 hover:text-ink"
            >
              {showInactive ? 'Hide' : 'Show'} inactive ({inactive.length})
            </button>
            {showInactive && (
              <ul className="mt-2 divide-y divide-border">
                {inactive.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm text-ink-3">
                    <span>
                      {c.name} <span className="text-xs">({TYPE_LABEL[c.type] ?? c.type})</span>
                    </span>
                    <Button variant="ghost" aria-label={`Activate ${c.name}`} onClick={() => toggleCategory(c)}>
                      Activate
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
