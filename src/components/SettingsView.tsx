'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api-client';

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

export function SettingsView({ projectId, initialProject }: { projectId: string; initialProject: Project }) {
  const [project, setProject] = useState(initialProject);
  const [name, setName] = useState(initialProject.name);
  const [description, setDescription] = useState(initialProject.description ?? '');
  const [startDate, setStartDate] = useState(initialProject.startDate.slice(0, 10));
  const [status, setStatus] = useState(initialProject.status);
  const [savingProject, setSavingProject] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState('material');
  const [addingCat, setAddingCat] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    setNotice(null);
    setSavingProject(true);
    try {
      const res = await api.patch<{ project: Project }>(`/api/projects/${projectId}`, {
        name,
        description: description || null,
        startDate: new Date(startDate).toISOString(),
        status,
        version: project.version,
      });
      setProject(res.project);
      setNotice('Project saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save project');
    } finally {
      setSavingProject(false);
    }
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setAddingCat(true);
      await api.post(`/api/projects/${projectId}/categories`, { name: catName, type: catType });
      setCatName('');
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

  async function renameCategory(c: Category) {
    const next = window.prompt('Rename category', c.name);
    if (next === null || next.trim() === '' || next === c.name) return;
    setError(null);
    try {
      await api.patch(`/api/projects/${projectId}/categories/${c.id}`, { name: next.trim() });
      void loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename category');
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      <form onSubmit={saveProject} className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-slate-700">Project</h2>
        <label className="block text-sm">
          <span className="text-slate-700">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-700">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-slate-700">Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-700">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              {['active', 'paused', 'completed'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="submit"
          disabled={savingProject}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {savingProject ? 'Saving…' : 'Save project'}
        </button>
      </form>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-slate-700">Categories</h2>
        <form onSubmit={addCategory} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            required
            placeholder="Category name"
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={catType}
            onChange={(e) => setCatType(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {CATEGORY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={addingCat}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Add
          </button>
        </form>

        <ul className="mt-3 divide-y divide-slate-100">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2 text-sm">
              <span className={c.isActive ? '' : 'text-slate-400 line-through'}>
                {c.name} <span className="text-xs text-slate-400">({c.type})</span>
              </span>
              <span className="flex gap-2">
                <button type="button" onClick={() => renameCategory(c)} className="text-primary hover:underline">
                  Rename
                </button>
                <button type="button" onClick={() => toggleCategory(c)} className="text-slate-600 hover:underline">
                  {c.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
