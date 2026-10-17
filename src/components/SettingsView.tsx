'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Check, ChevronDown, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, MoneyInput, Select, TextInput, Textarea, DateInput } from '@/components/ui/inputs';
import { LocationFields, type LocationValue } from '@/components/LocationFields';
import { useToast } from '@/components/ui/Toast';
import { todayIST } from '@/lib/period';

type Project = {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  status: string;
  archivedAt: string | null;
  totalBudget: string | null;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  version: number;
};
type Category = { id: string; name: string; type: string; isActive: boolean };

const CATEGORY_TYPES = [
  'material',
  'labour',
  'tax',
  'utility',
  'equipment',
  'transport',
  'professional',
  'subcontract',
  'overhead',
  'finance',
  'misc',
];
const TYPE_LABEL: Record<string, string> = {
  material: 'Material',
  labour: 'Labour',
  tax: 'Tax',
  utility: 'Utility',
  equipment: 'Equipment',
  transport: 'Transport',
  professional: 'Professional',
  subcontract: 'Subcontract',
  overhead: 'Overhead',
  finance: 'Finance',
  misc: 'Misc',
};

export function SettingsView({ projectId, initialProject }: { projectId: string; initialProject: Project }) {
  const toast = useToast();
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [archivedAt, setArchivedAt] = useState(initialProject.archivedAt);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(initialProject.name);
  const [description, setDescription] = useState(initialProject.description ?? '');
  const [startDate, setStartDate] = useState(todayIST(new Date(initialProject.startDate)));
  const [status, setStatus] = useState(initialProject.status);
  const [totalBudget, setTotalBudget] = useState(initialProject.totalBudget ?? '');
  const [location, setLocation] = useState<LocationValue>({
    locationName: initialProject.locationName ?? '',
    latitude: initialProject.latitude,
    longitude: initialProject.longitude,
  });
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
        totalBudget: totalBudget === '' ? null : Number(totalBudget),
        locationName: location.locationName.trim() || null,
        latitude: location.latitude,
        longitude: location.longitude,
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

  async function toggleArchive() {
    setError(null);
    setArchiving(true);
    try {
      const archiving = !archivedAt;
      await api.post(`/api/projects/${projectId}/${archiving ? 'archive' : 'unarchive'}`);
      setArchivedAt(archiving ? new Date().toISOString() : null);
      toast.notify(archiving ? 'Project archived' : 'Project unarchived');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change archive state');
    } finally {
      setArchiving(false);
    }
  }

  async function deleteProject() {
    setError(null);
    setDeleting(true);
    try {
      await api.delete(`/api/projects/${projectId}`);
      router.push('/projects');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

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
        <Field label="Total budget" hint="Overall estimate for the build (optional)">
          <MoneyInput value={totalBudget} onValueChange={setTotalBudget} placeholder="0" />
        </Field>
        <LocationFields value={location} onChange={setLocation} />
        <Button type="submit" loading={savingProject}>
          {!savingProject && <Save size={16} aria-hidden />} Save project
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
                  <Pencil size={15} aria-hidden /> <span className="hidden sm:inline">Rename</span>
                </Button>
                <Button variant="ghost" aria-label={`Deactivate ${c.name}`} onClick={() => toggleCategory(c)}>
                  <Archive size={15} aria-hidden /> <span className="hidden sm:inline">Deactivate</span>
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
              className="inline-flex min-h-11 items-center gap-1 text-sm text-ink-3 hover:text-ink"
            >
              <ChevronDown size={16} aria-hidden className={`transition-transform ${showInactive ? 'rotate-180' : ''}`} />
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
                      <ArchiveRestore size={15} aria-hidden /> <span className="hidden sm:inline">Activate</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="font-display text-lg font-semibold text-danger">Danger zone</h2>
        <p className="mt-1 text-sm text-ink-2">
          Archiving hides this project from your list but keeps every expense, funding entry, photo and
          note. Deleting removes the project and everything in it, permanently.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void toggleArchive()} loading={archiving}>
            {!archiving && (archivedAt ? <ArchiveRestore size={16} aria-hidden /> : <Archive size={16} aria-hidden />)}
            {archivedAt ? 'Unarchive project' : 'Archive project'}
          </Button>
          <Button variant="danger" onClick={() => setConfirmDelete(true)} loading={deleting}>
            {!deleting && <Trash2 size={16} aria-hidden />} Delete project
          </Button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this project?"
        message="This permanently removes the project and all of its expenses, funding, diary entries and photos. This cannot be undone."
        confirmLabel="Delete permanently"
        destructive
        onConfirm={() => void deleteProject()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
