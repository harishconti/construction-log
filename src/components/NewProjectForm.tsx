'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Alert } from '@/components/ui/Alert';
import { Field, TextInput, Textarea } from '@/components/ui/inputs';
import { todayIST } from '@/lib/period';

export function NewProjectForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(() => todayIST());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { project } = await api.post<{ project: { id: string } }>('/api/projects', {
        name,
        description: description || null,
        startDate: new Date(startDate).toISOString(),
      });
      setName('');
      setDescription('');
      setOpen(false);
      router.push(`/projects/${project.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={16} aria-hidden /> New project
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="New project"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="new-project-form" className="flex-1" loading={pending}>
              Create
            </Button>
          </div>
        }
      >
        <form id="new-project-form" onSubmit={submit} className="space-y-3">
          <Field label="Name">
            <TextInput required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Description" hint="Optional">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </Field>
          <Field label="Start date">
            <input
              type="date"
              value={startDate}
              max={todayIST()}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-ink md:text-sm"
            />
          </Field>
          {error && <Alert message={error} />}
        </form>
      </Sheet>
    </>
  );
}
