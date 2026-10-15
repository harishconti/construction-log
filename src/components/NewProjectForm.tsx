'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Alert } from '@/components/ui/Alert';
import { DateInput, Field, TextInput, Textarea } from '@/components/ui/inputs';
import { EMPTY_LOCATION, LocationFields, type LocationValue } from '@/components/LocationFields';
import { todayIST } from '@/lib/period';

export function NewProjectForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(() => todayIST());
  const [location, setLocation] = useState<LocationValue>(EMPTY_LOCATION);
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
        startDate, // bare YYYY-MM-DD: the server reads it as an IST calendar date
        locationName: location.locationName.trim() || null,
        latitude: location.latitude,
        longitude: location.longitude,
      });
      setName('');
      setDescription('');
      setLocation(EMPTY_LOCATION);
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
            <DateInput value={startDate} max={todayIST()} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <LocationFields value={location} onChange={setLocation} />
          {error && <Alert message={error} />}
        </form>
      </Sheet>
    </>
  );
}
